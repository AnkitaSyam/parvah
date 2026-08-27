-- backend/supabase/migrations/005_verify_patient_isolation.sql
-- Idempotent verification & repair script for RLS policies

-- 1. Enable RLS on core tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_myths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_timeline ENABLE ROW LEVEL SECURITY;

-- 2. Clean up existing policies if present
DROP POLICY IF EXISTS "ASHA worker select patients" ON public.patients;
DROP POLICY IF EXISTS "ASHA worker update patients" ON public.patients;
DROP POLICY IF EXISTS "patients insert own assignment" ON public.patients;
DROP POLICY IF EXISTS "visits own access" ON public.visits;
DROP POLICY IF EXISTS "detected myths own access" ON public.detected_myths;
DROP POLICY IF EXISTS "risk timeline own access" ON public.risk_timeline;

-- 3. Recreate policies with auth.uid() = asha_worker_id scoping

-- Patients Policies
CREATE POLICY "ASHA worker select patients" ON public.patients
    FOR SELECT TO authenticated
    USING (auth.uid() = asha_worker_id);

CREATE POLICY "ASHA worker update patients" ON public.patients
    FOR UPDATE TO authenticated
    USING (auth.uid() = asha_worker_id)
    WITH CHECK (auth.uid() = asha_worker_id);

CREATE POLICY "patients insert own assignment" ON public.patients
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = asha_worker_id);

-- Visits Policy
CREATE POLICY "visits own access" ON public.visits
    FOR ALL TO authenticated
    USING (auth.uid() = asha_worker_id)
    WITH CHECK (auth.uid() = asha_worker_id);

-- Detected Myths Policy
CREATE POLICY "detected myths own access" ON public.detected_myths
    FOR ALL TO authenticated
    USING (auth.uid() = asha_worker_id)
    WITH CHECK (auth.uid() = asha_worker_id);

-- Risk Timeline Policy
CREATE POLICY "risk timeline own access" ON public.risk_timeline
    FOR ALL TO authenticated
    USING (auth.uid() = asha_worker_id)
    WITH CHECK (auth.uid() = asha_worker_id);
