import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-only RAG layer for Cure AI.
 *
 * Pipeline: ingest -> clean -> chunk (with metadata) -> embed -> pgvector
 *           query -> embed -> hybrid (vector + keyword) search -> filter
 *                 -> dedupe -> rerank -> compact grounded context + sources
 *
 * Retrieval always runs as the signed-in user, so RLS scopes everything to
 * their own documents. Never import this from client code.
 */

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 175;
const MIN_CHUNK_CHARS = 120;
const MAX_CHUNKS_PER_DOC = 60;
const EMBED_BATCH = 32;

/** Retrieval tuning. */
const CANDIDATES = 12;
const MIN_SIMILARITY = 0.28;
const MAX_SELECTED = 4;
const MAX_CONTEXT_CHARS = 4500;

type Client = SupabaseClient<Database>;

export type ChunkMetadata = {
  document_id: string;
  document_title: string;
  section?: string;
  page?: number;
  topic?: string;
  source: string;
};

export type RetrievedChunk = {
  content: string;
  similarity: number;
  keywordRank: number;
  score: number;
  metadata: ChunkMetadata;
};

export type Grounding = {
  /** Prompt-ready context block. Empty string when nothing relevant was found. */
  context: string;
  /** Human-readable citations built from real document metadata. */
  sources: string[];
  /** True when at least one sufficiently relevant chunk was selected. */
  used: boolean;
  chunks: RetrievedChunk[];
};

const EMPTY_GROUNDING: Grounding = { context: "", sources: [], used: false, chunks: [] };

/** File types we can reliably read as plain text inside the Worker runtime. */
function isTextLike(fileName: string, fileType: string | null): boolean {
  const t = (fileType ?? "").toLowerCase();
  if (t.startsWith("text/") || t.includes("json") || t.includes("csv") || t.includes("markdown")) {
    return true;
  }
  return /\.(txt|md|markdown|csv|json|log|rtf)$/i.test(fileName);
}

/** Normalises whitespace and strips repeated boilerplate lines. */
export function cleanText(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim());

  const seen = new Map<string, number>();
  const kept: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    // Drop short lines (headers/footers) that repeat many times in the doc.
    const n = (seen.get(line) ?? 0) + 1;
    seen.set(line, n);
    if (line.length < 60 && n > 3) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Detects the nearest preceding heading-ish line for section metadata. */
function sectionOf(text: string): string | undefined {
  const lines = text.split("\n").slice(0, 4);
  for (const line of lines) {
    const l = line.trim();
    if (!l || l.length > 80) continue;
    if (/^#{1,6}\s+/.test(l)) return l.replace(/^#{1,6}\s+/, "");
    if (/^[A-Z][A-Za-z0-9 ,\-/()]+:?$/.test(l) && l === l.toUpperCase()) return l.replace(/:$/, "");
  }
  return undefined;
}

function pageOf(text: string): number | undefined {
  const m = text.match(/\bpage\s+(\d{1,4})\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

export function chunkText(text: string): string[] {
  const clean = cleanText(text);
  if (!clean) return [];
  const chunks: string[] = [];
  const seen = new Set<string>();
  let start = 0;
  while (start < clean.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const breakAt = clean.lastIndexOf("\n", end);
      const sentence = clean.lastIndexOf(". ", end);
      const pivot = Math.max(breakAt, sentence);
      if (pivot > start + CHUNK_SIZE * 0.5) end = pivot + 1;
    }
    const piece = clean.slice(start, end).trim();
    const key = piece.toLowerCase().replace(/\s+/g, " ");
    if (piece.length >= MIN_CHUNK_CHARS && !seen.has(key)) {
      seen.add(key);
      chunks.push(piece);
    } else if (piece && chunks.length === 0 && piece.length > 0) {
      chunks.push(piece);
    }
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

/**
 * Embeds text. Uses OpenAI directly when OPENAI_API_KEY is configured and
 * falls back once to the Lovable AI Gateway — mirroring the chat provider.
 */
async function embed(inputs: string[]): Promise<number[][]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;

  const call = async (
    url: string,
    headers: Record<string, string>,
    model: string,
  ): Promise<number[][]> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ model, input: inputs, dimensions: EMBEDDING_DIMS }),
    });
    if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  };

  if (openaiKey) {
    try {
      return await call(
        "https://api.openai.com/v1/embeddings",
        { Authorization: `Bearer ${openaiKey}` },
        "text-embedding-3-small",
      );
    } catch (err) {
      console.error("[rag] OpenAI embeddings failed, trying Lovable AI:", (err as Error)?.message);
      if (!lovableKey) throw err;
    }
  }
  if (!lovableKey) throw new Error("No embedding provider configured.");
  return await call(
    "https://ai.gateway.lovable.dev/v1/embeddings",
    { "Lovable-API-Key": lovableKey },
    EMBEDDING_MODEL,
  );
}

/**
 * Indexes any Medical Library documents that have no chunks yet.
 * Documents that are already indexed with the current model are skipped, so
 * embeddings are never regenerated for unchanged documents.
 */
export async function indexPendingDocuments(supabase: Client, userId: string): Promise<number> {
  const { data: docs, error } = await supabase
    .from("medical_documents")
    .select("id, file_name, file_path, file_type, category")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error || !docs?.length) return 0;

  const { data: indexed } = await supabase
    .from("document_chunks")
    .select("document_id")
    .eq("user_id", userId)
    .eq("model_version", EMBEDDING_MODEL);
  const done = new Set((indexed ?? []).map((r) => r.document_id));

  let count = 0;
  for (const doc of docs) {
    if (done.has(doc.id)) continue;
    if (!isTextLike(doc.file_name, doc.file_type)) continue;
    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from("medical-library")
        .download(doc.file_path);
      if (dlErr || !file) continue;

      const chunks = chunkText(await file.text());
      if (!chunks.length) continue;

      const vectors: number[][] = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        vectors.push(...(await embed(chunks.slice(i, i + EMBED_BATCH))));
      }

      const docRecord = doc as typeof doc & { title?: string | null; category?: string | null };
      const title = (docRecord.title || doc.file_name) as string;

      const rows = chunks.map((content, i) => {
        const metadata: ChunkMetadata = {
          document_id: doc.id,
          document_title: title,
          source: "Medical Library",
        };
        const section = sectionOf(content);
        if (section) metadata.section = section;
        const page = pageOf(content);
        if (page) metadata.page = page;
        if (docRecord.category) metadata.topic = docRecord.category;
        return {
          user_id: userId,
          document_id: doc.id,
          chunk_index: i,
          content: `${title}\n${content}`,
          embedding: JSON.stringify(vectors[i]),
          model_version: EMBEDDING_MODEL,
          metadata: metadata as unknown as Database["public"]["Tables"]["document_chunks"]["Insert"]["metadata"],
        };
      });
      const { error: insErr } = await supabase.from("document_chunks").upsert(rows, {
        onConflict: "document_id,chunk_index",
      });
      if (insErr) throw insErr;
      count += rows.length;
    } catch (err) {
      console.error(`[rag] indexing failed for ${doc.id}:`, (err as Error)?.message);
    }
  }
  return count;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "what", "are", "was", "you", "your",
  "have", "has", "how", "why", "does", "can", "about", "from", "into", "when",
]);

function keywords(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
    ),
  ].slice(0, 12);
}

/** Cheap lexical overlap used for reranking and near-duplicate detection. */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const w of a) if (setB.has(w)) hit++;
  return hit / a.length;
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function citation(m: ChunkMetadata): string {
  const parts = [`${m.source}: ${m.document_title}`];
  if (m.section) parts.push(`Section: ${m.section}`);
  if (m.page) parts.push(`Page: ${m.page}`);
  return parts.join(" · ");
}

/**
 * Full retrieval pipeline: embed -> hybrid search -> threshold -> dedupe ->
 * rerank -> compact context with real citations.
 */
export async function retrieveGrounding(
  supabase: Client,
  userId: string,
  query: string,
  maxChunks = MAX_SELECTED,
): Promise<Grounding> {
  try {
    if (!query.trim()) return EMPTY_GROUNDING;
    await indexPendingDocuments(supabase, userId);

    const [vector] = await embed([query.slice(0, 6000)]);
    if (!vector) return EMPTY_GROUNDING;

    const { data, error } = await supabase.rpc("hybrid_match_document_chunks", {
      query_embedding: JSON.stringify(vector) as unknown as string,
      match_user_id: userId,
      query_text: query.slice(0, 400),
      match_count: CANDIDATES,
    });
    if (error || !data?.length) {
      if (error) console.error("[rag] search failed:", error.message);
      return EMPTY_GROUNDING;
    }

    const kw = keywords(query);
    const candidates: RetrievedChunk[] = (data as unknown as {
      content: string;
      metadata: unknown;
      similarity: number | null;
      keyword_rank: number | null;
      document_id: string;
    }[])
      .map((r) => {
        const meta = (r.metadata ?? {}) as Partial<ChunkMetadata>;
        const metadata: ChunkMetadata = {
          document_id: meta.document_id ?? r.document_id,
          document_title: meta.document_title ?? "Uploaded document",
          source: meta.source ?? "Medical Library",
          ...(meta.section ? { section: meta.section } : {}),
          ...(meta.page ? { page: meta.page } : {}),
          ...(meta.topic ? { topic: meta.topic } : {}),
        };
        const similarity = r.similarity ?? 0;
        const keywordRank = r.keyword_rank ?? 0;
        const lexical = overlap(kw, tokens(r.content));
        const titleHit = overlap(kw, tokens(`${metadata.document_title} ${metadata.section ?? ""}`));
        // Lightweight reranker: semantic + keyword + section/document relevance.
        const score = similarity + Math.min(keywordRank * 2, 0.25) + lexical * 0.2 + titleHit * 0.1;
        return { content: r.content, similarity, keywordRank, score, metadata };
      })
      .filter((c) => c.similarity >= MIN_SIMILARITY || c.keywordRank > 0.05)
      .sort((a, b) => b.score - a.score);

    // Drop near-duplicate chunks.
    const selected: RetrievedChunk[] = [];
    for (const c of candidates) {
      const t = tokens(c.content);
      if (selected.some((s) => overlap(t, tokens(s.content)) > 0.8)) continue;
      selected.push(c);
      if (selected.length >= maxChunks) break;
    }

    if (!selected.length) {
      console.info("[rag] no sufficiently relevant chunks", {
        candidates: candidates.length,
        top: Number((data[0]?.similarity ?? 0).toFixed(3)),
      });
      return EMPTY_GROUNDING;
    }

    let used = 0;
    const passages: string[] = [];
    const sources: string[] = [];
    selected.forEach((c, i) => {
      const cite = citation(c.metadata);
      const body = c.content.slice(0, Math.max(0, MAX_CONTEXT_CHARS - used));
      if (!body) return;
      used += body.length;
      passages.push(`[${i + 1}] (${cite})\n${body}`);
      if (!sources.includes(cite)) sources.push(cite);
    });

    console.info("[rag] retrieval", {
      chunks: passages.length,
      scores: selected.map((c) => Number(c.similarity.toFixed(3))),
      sources: sources.length,
      grounded: passages.length > 0,
    });

    if (!passages.length) return EMPTY_GROUNDING;

    return {
      context: `\n\nRetrieved reference material from the user's own Medical Library (cite only these; never invent sources):\n${passages.join("\n\n")}\n`,
      sources,
      used: true,
      chunks: selected,
    };
  } catch (err) {
    console.error("[rag] retrieveGrounding failed:", (err as Error)?.message);
    return EMPTY_GROUNDING;
  }
}

/**
 * Backwards-compatible string API used by existing callers.
 * Returns "" when nothing sufficiently relevant was found.
 */
export async function retrieveContext(
  supabase: Client,
  userId: string,
  query: string,
  matchCount = MAX_SELECTED,
): Promise<string> {
  const g = await retrieveGrounding(supabase, userId, query, matchCount);
  return g.context;
}

/** Shared grounding instructions appended to prompts that use RAG. */
export const GROUNDING_RULES = `Grounding rules:
- When retrieved reference material is provided, answer primarily from it and prefer it over your own recollection.
- Clearly distinguish information taken from the retrieved documents from general medical knowledge.
- If the retrieved material does not cover the question, say so plainly and give only safe, general information.
- Never fabricate citations, page numbers, studies or sources. Only cite the documents listed in the retrieved material.`;

/** Instruction used when retrieval found nothing relevant. */
export const NO_GROUNDING_NOTE = `\n\n(No sufficiently relevant document was found in the user's Medical Library. Do not claim any document supports your answer; answer from safe general knowledge and say that no matching document was available.)`;
