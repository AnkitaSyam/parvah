-- Enable UUID generation extension if not present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Patients Table
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    asha_worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    due_date DATE,
    current_risk_score NUMERIC DEFAULT 0,
    risk_level TEXT DEFAULT 'normal' CHECK (risk_level IN ('normal', 'watch', 'alert')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Calls Table
CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('app_upload', 'sms', 'asha_call')),
    transcript TEXT,
    symptoms_extracted JSONB DEFAULT '[]'::jsonb,
    myths_flagged JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SMS Alerts Table
CREATE TABLE IF NOT EXISTS public.sms_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    message TEXT,
    alert_type TEXT CHECK (alert_type IN ('myth', 'emergency', 'neutral')),
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ENABLE ROW LEVEL SECURITY --
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_alerts ENABLE ROW LEVEL SECURITY;

-- POLICIES --

-- Patients Policy: SELECT and UPDATE allowed only where auth.uid() = asha_worker_id
DROP POLICY IF EXISTS "ASHA worker select patients" ON public.patients;
CREATE POLICY "ASHA worker select patients" ON public.patients
    FOR SELECT TO authenticated
    USING (auth.uid() = asha_worker_id);

DROP POLICY IF EXISTS "ASHA worker update patients" ON public.patients;
CREATE POLICY "ASHA worker update patients" ON public.patients
    FOR UPDATE TO authenticated
    USING (auth.uid() = asha_worker_id)
    WITH CHECK (auth.uid() = asha_worker_id);

-- Calls Policy: SELECT allowed only where patient_id is in (SELECT id FROM patients WHERE asha_worker_id = auth.uid())
DROP POLICY IF EXISTS "ASHA worker select calls" ON public.calls;
CREATE POLICY "ASHA worker select calls" ON public.calls
    FOR SELECT TO authenticated
    USING (
        patient_id IN (
            SELECT id FROM public.patients WHERE asha_worker_id = auth.uid()
        )
    );

-- SMS Alerts Policy: Service role access only for now (no direct authenticated SELECT policy)
-- RLS default blocks public/authenticated access to sms_alerts unless using service role key.
