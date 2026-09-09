-- backend/supabase/migrations/009_repair_postpartum_and_immunization.sql
--
-- Consolidated repair + the postpartum / immunization continuum.
--
-- Part A  Repairs schema drift that made writes fail silently.
-- Part B  Extends the patient lifecycle past delivery (antenatal -> postpartum).
-- Part C  Adds immunization tracking for the infant.
-- Part D  Moves profile creation into a database trigger.
-- Part E  RLS + indexes for everything above.
--
-- Every statement is idempotent so this runs cleanly on both a fresh
-- `supabase db reset` and an already-deployed database.

-- ══════════════════════════════════════════════════════════════════════
-- PART A — Repairs
-- ══════════════════════════════════════════════════════════════════════

-- A1. Patient age. The API required it, the form sent it, and nothing
--     ever stored it — there was no column. Maternal age is a first-order
--     risk factor (<18 and >=35 both change the referral threshold).
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS age INT;

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_age_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_age_check
    CHECK (age IS NULL OR (age >= 10 AND age <= 60));

-- A2. detected_myths.myth_id is a UUID FK, but the LLM returns the myth's
--     external_id (e.g. "myth_papaya"). The insert therefore failed with
--     22P02 on every matched myth, and the error was swallowed. We keep the
--     UUID FK (resolved server-side now) and additionally persist the
--     external id for traceability when no catalog row matches.
ALTER TABLE public.detected_myths
    ADD COLUMN IF NOT EXISTS myth_external_id TEXT;

-- A3. The counselling script shown in the UI was a hardcoded Hindi constant.
--     It is now generated per detection, in the patient's language.
ALTER TABLE public.detected_myths
    ADD COLUMN IF NOT EXISTS counseling_script TEXT;

ALTER TABLE public.detected_myths
    ADD COLUMN IF NOT EXISTS addressed_at TIMESTAMPTZ;

-- A4. Audio moved from public local disk to a private Supabase Storage
--     bucket; we store the object path, not a public URL.
ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS audio_storage_path TEXT;

ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS transcript_language TEXT;

ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- A5. The myth catalog is readable by any signed-in worker. It is reference
--     data, not patient data, so a permissive SELECT policy is correct —
--     but RLS must still be ON so nothing else leaks through.
ALTER TABLE public.pregnancy_myths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "myth catalog readable by authenticated" ON public.pregnancy_myths;
CREATE POLICY "myth catalog readable by authenticated" ON public.pregnancy_myths
    FOR SELECT TO authenticated
    USING (true);

-- ══════════════════════════════════════════════════════════════════════
-- PART B — Postpartum continuum
-- ══════════════════════════════════════════════════════════════════════

-- The app previously ended at delivery: gestational_weeks counted up and
-- the record simply stopped. Most maternal deaths occur postpartum, and
-- HBNC (Home Based Newborn Care) visits on days 1/3/7/14/21/28/42 are a
-- core part of an ASHA worker's paid job.

ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'antenatal',
    ADD COLUMN IF NOT EXISTS delivery_date DATE,
    ADD COLUMN IF NOT EXISTS delivery_outcome TEXT,
    ADD COLUMN IF NOT EXISTS delivery_place TEXT,
    ADD COLUMN IF NOT EXISTS baby_name TEXT,
    ADD COLUMN IF NOT EXISTS baby_sex TEXT,
    ADD COLUMN IF NOT EXISTS baby_birth_weight_kg NUMERIC(4,2);

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_stage_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_stage_check
    CHECK (stage IN ('antenatal', 'postpartum'));

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_delivery_outcome_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_delivery_outcome_check
    CHECK (delivery_outcome IS NULL OR delivery_outcome IN ('live_birth', 'stillbirth', 'neonatal_death'));

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_delivery_place_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_delivery_place_check
    CHECK (delivery_place IS NULL OR delivery_place IN ('institutional', 'home', 'in_transit'));

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_baby_sex_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_baby_sex_check
    CHECK (baby_sex IS NULL OR baby_sex IN ('female', 'male', 'other'));

-- A postpartum patient must have a delivery date, otherwise the PNC
-- schedule and the postpartum risk decay have no origin to count from.
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_postpartum_needs_date;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_postpartum_needs_date
    CHECK (stage <> 'postpartum' OR delivery_date IS NOT NULL);

-- Each visit records which phase of care it belongs to, so red-flag rules
-- and risk decay can be selected per stage rather than per patient's
-- current state (a visit logged before delivery stays antenatal forever).
ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'antenatal';

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_stage_check;
ALTER TABLE public.visits
    ADD CONSTRAINT visits_stage_check
    CHECK (stage IN ('antenatal', 'postpartum'));

-- Risk timeline entries carry the stage and the day-since-delivery so the
-- postpartum decay curve (days, not weeks) can be computed without a join.
ALTER TABLE public.risk_timeline
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'antenatal',
    ADD COLUMN IF NOT EXISTS postpartum_day INT;

ALTER TABLE public.risk_timeline DROP CONSTRAINT IF EXISTS risk_timeline_stage_check;
ALTER TABLE public.risk_timeline
    ADD CONSTRAINT risk_timeline_stage_check
    CHECK (stage IN ('antenatal', 'postpartum'));

-- gestational_week is nullable for postpartum entries.
ALTER TABLE public.risk_timeline ALTER COLUMN gestational_week DROP NOT NULL;

-- Not every risk entry comes from a recorded visit. Recording a delivery can
-- raise a flag directly (a low-birth-weight newborn needs extra HBNC contact),
-- and there is no visit row to attach it to.
ALTER TABLE public.risk_timeline ALTER COLUMN visit_id DROP NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- PART C — Immunization tracking
-- ══════════════════════════════════════════════════════════════════════

-- Deliberately lean: the due dates are computed from delivery_date by the
-- backend (services/careSchedule.js) against India's National Immunization
-- Schedule. This table stores only what actually happened — including
-- refusals, which are the hard problem in tier-2/3 districts and the part
-- a date calculator cannot solve.

CREATE TABLE IF NOT EXISTS public.immunization_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    asha_worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vaccine_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    given_date DATE,
    refusal_reason TEXT,
    -- Set when the refusal was detected from visit audio rather than
    -- entered by hand, so hesitancy can be traced back to what was said.
    detected_from_visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.immunization_records DROP CONSTRAINT IF EXISTS immunization_records_status_check;
ALTER TABLE public.immunization_records
    ADD CONSTRAINT immunization_records_status_check
    CHECK (status IN ('pending', 'given', 'refused', 'unavailable'));

CREATE UNIQUE INDEX IF NOT EXISTS immunization_records_patient_vaccine_key
    ON public.immunization_records (patient_id, vaccine_code);

-- ══════════════════════════════════════════════════════════════════════
-- PART D — Profile creation trigger
-- ══════════════════════════════════════════════════════════════════════

-- AuthModal.jsx created the profiles row from the browser across three
-- duplicated code paths, each catching Postgres error codes (42703 /
-- PGRST204) and retrying the insert with fewer columns — the client
-- discovering its own schema at runtime. This replaces all of it.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone_number, village_name, age, city, state, pincode)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'ASHA Worker'),
        NULLIF(NEW.raw_user_meta_data->>'phone_number', ''),
        NULLIF(NEW.raw_user_meta_data->>'village_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'age', '')::INT,
        NULLIF(NEW.raw_user_meta_data->>'city', ''),
        NULLIF(NEW.raw_user_meta_data->>'state', ''),
        NULLIF(NEW.raw_user_meta_data->>'pincode', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never block signup because the profile row failed; the app backfills.
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════════════════
-- PART E — RLS + indexes
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.immunization_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "immunization own access" ON public.immunization_records;
CREATE POLICY "immunization own access" ON public.immunization_records
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);

-- Patients could be created and updated but never deleted — the UI had no
-- way to remove a mistyped record.
DROP POLICY IF EXISTS "ASHA worker delete patients" ON public.patients;
CREATE POLICY "ASHA worker delete patients" ON public.patients
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id);

-- Every RLS policy above filters on these columns; without indexes each
-- check is a sequential scan (see supabase-postgres-best-practices:
-- security-rls-performance, schema-foreign-key-indexes).
CREATE INDEX IF NOT EXISTS patients_asha_worker_id_idx        ON public.patients (asha_worker_id);
CREATE INDEX IF NOT EXISTS patients_stage_idx                 ON public.patients (stage);
CREATE INDEX IF NOT EXISTS visits_asha_worker_id_idx          ON public.visits (asha_worker_id);
CREATE INDEX IF NOT EXISTS visits_patient_id_idx              ON public.visits (patient_id);
CREATE INDEX IF NOT EXISTS detected_myths_asha_worker_id_idx  ON public.detected_myths (asha_worker_id);
CREATE INDEX IF NOT EXISTS detected_myths_patient_id_idx      ON public.detected_myths (patient_id);
CREATE INDEX IF NOT EXISTS detected_myths_visit_id_idx        ON public.detected_myths (visit_id);
CREATE INDEX IF NOT EXISTS detected_myths_myth_id_idx         ON public.detected_myths (myth_id);
CREATE INDEX IF NOT EXISTS risk_timeline_asha_worker_id_idx   ON public.risk_timeline (asha_worker_id);
CREATE INDEX IF NOT EXISTS risk_timeline_patient_id_idx       ON public.risk_timeline (patient_id);
CREATE INDEX IF NOT EXISTS risk_timeline_visit_id_idx         ON public.risk_timeline (visit_id);
CREATE INDEX IF NOT EXISTS immunization_patient_id_idx        ON public.immunization_records (patient_id);
CREATE INDEX IF NOT EXISTS immunization_asha_worker_id_idx    ON public.immunization_records (asha_worker_id);

-- The risk scorer reads the last 21 days of entries per patient on every
-- visit; this composite index serves that access pattern directly.
CREATE INDEX IF NOT EXISTS risk_timeline_patient_created_idx
    ON public.risk_timeline (patient_id, created_at DESC);
