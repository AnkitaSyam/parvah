-- backend/supabase/migrations/010_vitals_and_growth.sql
--
-- Vitals and infant growth.
--
-- Six of the fourteen red flags in data/redFlagSymptoms.json instruct the
-- ASHA worker to measure something — "Measure blood pressure immediately.
-- If >=140/90 mmHg, test urine for albumin and refer the same day" — and
-- there was nowhere in the schema to record the result. The risk model was
-- inferring pre-eclampsia risk from the words "swelling" and "headache"
-- while ignoring the numbers that actually define it.
--
-- Part A  Maternal vitals per visit.
-- Part B  Infant growth measurements.
-- Part C  RLS + indexes.

-- ══════════════════════════════════════════════════════════════════════
-- PART A — Maternal vitals
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.visit_vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    -- Nullable: a worker may record vitals at a contact that produced no
    -- recording (a quick BP check at the sub-centre, say).
    visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    asha_worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    stage TEXT DEFAULT 'antenatal',
    gestational_week INT,
    postpartum_day INT,

    systolic_bp INT,
    diastolic_bp INT,
    pulse_bpm INT,
    temperature_c NUMERIC(4,1),
    weight_kg NUMERIC(5,2),
    hemoglobin_gdl NUMERIC(4,1),
    -- Dipstick result: 'nil', 'trace', '1+', '2+', '3+', '4+'
    urine_albumin TEXT,
    fundal_height_cm NUMERIC(4,1),

    -- How the values arrived: 'manual' or 'voice' (parsed from the transcript
    -- and confirmed by the worker). Kept so voice-extracted numbers can be
    -- audited separately if they ever prove unreliable.
    source TEXT DEFAULT 'manual',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.visit_vitals DROP CONSTRAINT IF EXISTS visit_vitals_stage_check;
ALTER TABLE public.visit_vitals
    ADD CONSTRAINT visit_vitals_stage_check
    CHECK (stage IN ('antenatal', 'postpartum'));

ALTER TABLE public.visit_vitals DROP CONSTRAINT IF EXISTS visit_vitals_source_check;
ALTER TABLE public.visit_vitals
    ADD CONSTRAINT visit_vitals_source_check
    CHECK (source IN ('manual', 'voice'));

ALTER TABLE public.visit_vitals DROP CONSTRAINT IF EXISTS visit_vitals_albumin_check;
ALTER TABLE public.visit_vitals
    ADD CONSTRAINT visit_vitals_albumin_check
    CHECK (urine_albumin IS NULL OR urine_albumin IN ('nil', 'trace', '1+', '2+', '3+', '4+'));

-- Physiologically implausible values are almost always transcription or
-- typing errors, and a wrong BP drives a wrong referral. Reject them at the
-- database rather than grading them.
ALTER TABLE public.visit_vitals DROP CONSTRAINT IF EXISTS visit_vitals_ranges_check;
ALTER TABLE public.visit_vitals
    ADD CONSTRAINT visit_vitals_ranges_check
    CHECK (
        (systolic_bp      IS NULL OR systolic_bp      BETWEEN 60  AND 260) AND
        (diastolic_bp     IS NULL OR diastolic_bp     BETWEEN 30  AND 180) AND
        (pulse_bpm        IS NULL OR pulse_bpm        BETWEEN 30  AND 220) AND
        (temperature_c    IS NULL OR temperature_c    BETWEEN 30  AND 45)  AND
        (weight_kg        IS NULL OR weight_kg        BETWEEN 25  AND 200) AND
        (hemoglobin_gdl   IS NULL OR hemoglobin_gdl   BETWEEN 2   AND 20)  AND
        (fundal_height_cm IS NULL OR fundal_height_cm BETWEEN 5   AND 50)
    );

-- Systolic must exceed diastolic; a swapped pair reads as a false emergency.
ALTER TABLE public.visit_vitals DROP CONSTRAINT IF EXISTS visit_vitals_bp_order_check;
ALTER TABLE public.visit_vitals
    ADD CONSTRAINT visit_vitals_bp_order_check
    CHECK (systolic_bp IS NULL OR diastolic_bp IS NULL OR systolic_bp > diastolic_bp);

-- ══════════════════════════════════════════════════════════════════════
-- PART B — Infant growth
-- ══════════════════════════════════════════════════════════════════════

-- Immunization was tracked to age two but weight was not. Faltering growth is
-- the other half of child health, and the half that goes unnoticed — a child
-- can receive every dose on schedule and still be wasting.

CREATE TABLE IF NOT EXISTS public.child_growth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    asha_worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    measured_on DATE NOT NULL DEFAULT CURRENT_DATE,
    age_days INT,

    weight_kg NUMERIC(5,3) NOT NULL,
    length_cm NUMERIC(5,1),
    muac_cm NUMERIC(4,1),

    -- Classification computed at write time so a record keeps the grading it
    -- was acted on with, even if the reference table is later corrected.
    classification TEXT,
    faltering BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.child_growth DROP CONSTRAINT IF EXISTS child_growth_ranges_check;
ALTER TABLE public.child_growth
    ADD CONSTRAINT child_growth_ranges_check
    CHECK (
        weight_kg BETWEEN 0.3 AND 30 AND
        (length_cm IS NULL OR length_cm BETWEEN 20 AND 120) AND
        (muac_cm   IS NULL OR muac_cm   BETWEEN 5  AND 30)
    );

ALTER TABLE public.child_growth DROP CONSTRAINT IF EXISTS child_growth_classification_check;
ALTER TABLE public.child_growth
    ADD CONSTRAINT child_growth_classification_check
    CHECK (classification IS NULL OR classification IN
        ('severely_underweight', 'underweight', 'normal', 'above_normal', 'unknown'));

-- One measurement per child per day; a correction overwrites rather than
-- creating a second point that would show as a spurious weight change.
CREATE UNIQUE INDEX IF NOT EXISTS child_growth_patient_date_key
    ON public.child_growth (patient_id, measured_on);

-- ══════════════════════════════════════════════════════════════════════
-- PART C — RLS + indexes
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.visit_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_growth ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vitals own access" ON public.visit_vitals;
CREATE POLICY "vitals own access" ON public.visit_vitals
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);

DROP POLICY IF EXISTS "growth own access" ON public.child_growth;
CREATE POLICY "growth own access" ON public.child_growth
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);

CREATE INDEX IF NOT EXISTS visit_vitals_patient_idx      ON public.visit_vitals (patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS visit_vitals_visit_idx        ON public.visit_vitals (visit_id);
CREATE INDEX IF NOT EXISTS visit_vitals_worker_idx       ON public.visit_vitals (asha_worker_id);
CREATE INDEX IF NOT EXISTS child_growth_patient_idx      ON public.child_growth (patient_id, measured_on DESC);
CREATE INDEX IF NOT EXISTS child_growth_worker_idx       ON public.child_growth (asha_worker_id);
CREATE INDEX IF NOT EXISTS child_growth_visit_idx        ON public.child_growth (visit_id);
