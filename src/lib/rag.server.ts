import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-only RAG layer for Cure AI.
 *
 * Reuses the existing Medical Library (`medical-library` bucket +
 * `medical_documents` table), splits documents into chunks, embeds them and
 * stores the vectors in `document_chunks`. Retrieval runs as the signed-in
 * user, so RLS scopes everything to their own documents.
 *
 * Never import this from client code.
 */

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS_PER_DOC = 60;
const EMBED_BATCH = 32;

type Client = SupabaseClient<Database>;

/** File types we can reliably read as plain text inside the Worker runtime. */
function isTextLike(fileName: string, fileType: string | null): boolean {
  const t = (fileType ?? "").toLowerCase();
  if (t.startsWith("text/") || t.includes("json") || t.includes("csv") || t.includes("markdown")) {
    return true;
  }
  return /\.(txt|md|markdown|csv|json|log|rtf)$/i.test(fileName);
}

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
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
    if (piece) chunks.push(piece);
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
 * Best-effort: individual document failures are logged and skipped.
 */
export async function indexPendingDocuments(supabase: Client, userId: string): Promise<number> {
  const { data: docs, error } = await supabase
    .from("medical_documents")
    .select("id, file_name, file_path, file_type")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error || !docs?.length) return 0;

  const { data: indexed } = await supabase
    .from("document_chunks")
    .select("document_id")
    .eq("user_id", userId);
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

      const rows = chunks.map((content, i) => ({
        user_id: userId,
        document_id: doc.id,
        chunk_index: i,
        content: `${doc.file_name}\n${content}`,
        embedding: JSON.stringify(vectors[i]),
        model_version: EMBEDDING_MODEL,
      }));
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

/**
 * Retrieves the top relevant Medical Library chunks for a query and returns
 * them as a prompt-ready context block. Returns "" when nothing is available;
 * callers must keep working without context.
 */
export async function retrieveContext(
  supabase: Client,
  userId: string,
  query: string,
  matchCount = 5,
): Promise<string> {
  try {
    if (!query.trim()) return "";
    await indexPendingDocuments(supabase, userId);

    const [vector] = await embed([query.slice(0, 6000)]);
    if (!vector) return "";

    const { data, error } = await supabase.rpc("match_document_chunks", {
      query_embedding: JSON.stringify(vector) as unknown as string,
      match_user_id: userId,
      match_count: matchCount,
    });
    if (error || !data?.length) return "";

    const passages = data
      .filter((r) => (r.similarity ?? 0) > 0.15)
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join("\n\n");
    if (!passages) return "";

    return `\n\nReference material from the user's own Medical Library (use it when relevant, ignore it when not; never invent citations):\n${passages}\n`;
  } catch (err) {
    console.error("[rag] retrieveContext failed:", (err as Error)?.message);
    return "";
  }
}
