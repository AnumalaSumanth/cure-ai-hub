ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS document_chunks_tsv_idx
  ON public.document_chunks USING gin (content_tsv);

CREATE INDEX IF NOT EXISTS document_chunks_doc_idx
  ON public.document_chunks (document_id);

CREATE OR REPLACE FUNCTION public.hybrid_match_document_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  query_text text DEFAULT '',
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity float,
  keyword_rank float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT CASE WHEN coalesce(query_text, '') = '' THEN NULL
                ELSE websearch_to_tsquery('english', query_text) END AS tsq
  )
  SELECT c.id, c.document_id, c.chunk_index, c.content, c.metadata,
         1 - (c.embedding <=> query_embedding) AS similarity,
         CASE WHEN (SELECT tsq FROM q) IS NULL THEN 0::float
              ELSE ts_rank(c.content_tsv, (SELECT tsq FROM q))::float END AS keyword_rank
  FROM public.document_chunks c
  WHERE c.user_id = match_user_id
  ORDER BY
    (1 - (c.embedding <=> query_embedding))
    + CASE WHEN (SELECT tsq FROM q) IS NULL THEN 0
           ELSE least(ts_rank(c.content_tsv, (SELECT tsq FROM q)) * 2, 0.3) END DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_match_document_chunks(vector, uuid, text, int) TO authenticated, service_role;