-- Adds source-traceable fields used to synchronize the canonical myth JSON
-- with the pregnancy_myths catalog.
ALTER TABLE public.pregnancy_myths
    ADD COLUMN IF NOT EXISTS external_id TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS pregnancy_myths_external_id_key
    ON public.pregnancy_myths (external_id)
    WHERE external_id IS NOT NULL;
