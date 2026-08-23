-- Adds vector embedding support to pregnancy_myths for semantic retrieval.
-- Uses pgvector, which Supabase supports natively.

-- 1. Enable the extension (safe to run repeatedly)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add an embedding column.
--    Dimension = 384 because we use Xenova/all-MiniLM-L6-v2 (local, free,
--    no API key). If you swap embedding models later, this number must
--    match that model's output dimension, and you'll need to re-embed
--    every row (old vectors from a different model are not comparable).
ALTER TABLE public.pregnancy_myths
    ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. Approximate-nearest-neighbor index for fast cosine similarity search.
--    ivfflat needs at least a handful of rows to build well; with a small
--    myth catalog (dozens–hundreds of rows) this is still fast even
--    without the index, but we add it so it keeps scaling.
CREATE INDEX IF NOT EXISTS pregnancy_myths_embedding_idx
    ON public.pregnancy_myths
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- 4. RPC function: given a query embedding, return the top-N most similar
--    myths above a similarity threshold. Called from the backend via
--    supabase.rpc('match_pregnancy_myths', {...}).
--    Uses <=> (cosine distance); similarity = 1 - distance.
CREATE OR REPLACE FUNCTION match_pregnancy_myths (
    query_embedding vector(384),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    external_id text,
    myth_title text,
    common_myth text,
    medical_fact text,
    counseling_guidance text,
    category text,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        pm.id,
        pm.external_id,
        pm.myth_title,
        pm.common_myth,
        pm.medical_fact,
        pm.counseling_guidance,
        pm.category,
        1 - (pm.embedding <=> query_embedding) AS similarity
    FROM public.pregnancy_myths pm
    WHERE pm.embedding IS NOT NULL
      AND 1 - (pm.embedding <=> query_embedding) > match_threshold
    ORDER BY pm.embedding <=> query_embedding
    LIMIT match_count;
$$;
