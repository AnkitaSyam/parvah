-- Extends the audio-pipeline schema with the ASHA worker dashboard tables.
-- This migration is additive: 001_init.sql remains the source for calls and
-- this file adds only the fields/tables required by the legacy ASHA routes.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    village_name TEXT,
    sub_center TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS gestational_weeks INT DEFAULT 12,
    ADD COLUMN IF NOT EXISTS gravida INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS para INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS village TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
    ADD COLUMN IF NOT EXISTS blood_group TEXT,
    ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.patients
    DROP CONSTRAINT IF EXISTS patients_preferred_language_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_preferred_language_check
    CHECK (preferred_language IN ('en', 'hi', 'ml'));

CREATE TABLE IF NOT EXISTS public.visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    asha_worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_date DATE DEFAULT CURRENT_DATE,
    audio_url TEXT,
    transcript TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'transcribed', 'analyzed', 'error')),
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);



CREATE TABLE IF NOT EXISTS public.detected_myths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    asha_worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    myth_id UUID REFERENCES public.pregnancy_myths(id) ON DELETE SET NULL,
    extracted_quote TEXT NOT NULL,
    explanation TEXT NOT NULL,
    severity_impact TEXT DEFAULT 'medium' CHECK (severity_impact IN ('low', 'medium', 'high')),
    is_addressed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.risk_timeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    asha_worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symptom_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
    gestational_week INT,
    date_logged DATE DEFAULT CURRENT_DATE,
    flag_description TEXT NOT NULL,
    recommended_asha_action TEXT NOT NULL,
    requires_doctor_referral BOOLEAN DEFAULT FALSE,
    sms_alert_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_myths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles own access" ON public.profiles
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "patients insert own assignment" ON public.patients
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);
CREATE POLICY "visits own access" ON public.visits
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);
CREATE POLICY "detected myths own access" ON public.detected_myths
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);
CREATE POLICY "risk timeline own access" ON public.risk_timeline
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);


