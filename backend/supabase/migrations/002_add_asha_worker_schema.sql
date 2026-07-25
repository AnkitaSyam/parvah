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

CREATE TABLE IF NOT EXISTS public.pregnancy_myths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    myth_title TEXT NOT NULL,
    common_myth TEXT NOT NULL,
    medical_fact TEXT NOT NULL,
    counseling_guidance TEXT NOT NULL,
    category TEXT DEFAULT 'nutrition',
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
ALTER TABLE public.pregnancy_myths ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "authenticated myths read" ON public.pregnancy_myths
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "detected myths own access" ON public.detected_myths
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);
CREATE POLICY "risk timeline own access" ON public.risk_timeline
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = asha_worker_id)
    WITH CHECK ((SELECT auth.uid()) = asha_worker_id);

INSERT INTO public.pregnancy_myths (myth_title, common_myth, medical_fact, counseling_guidance, category) VALUES
('Eclipse Exposure Causes Deformity', 'Pregnant women must not step outside or look at the sun/moon during an eclipse, or the baby will be born with a cleft lip or birth defect.', 'Eclipses have no biological effect on fetal growth or genetics.', 'Reassure the family that it is safe to step outside; emphasize daily Iron-Folic Acid (IFA) tablets.', 'Superstition'),
('Eating Less in 1st Trimester Keeps Baby Small', 'Eating normal meals during early pregnancy makes the baby too big for normal delivery.', 'Restricting food can cause anemia, low birth weight, and fetal growth restriction.', 'Recommend three balanced meals and two healthy snacks daily.', 'Nutrition'),
('Saffron Milk Makes Baby Fair', 'Drinking saffron milk during pregnancy guarantees a fair complexion for the baby.', 'Complexion is determined by genetics; saffron does not change it.', 'Encourage milk for calcium and protein rather than for complexion.', 'Nutrition'),
('Iron-Folic Acid Tablets Make Fetus Dark or Heavy', 'IFA tablets make the baby dark or too heavy for delivery.', 'IFA prevents maternal anemia and does not change skin color or cause unsafe birth weight.', 'Encourage one IFA tablet daily after meals.', 'Medication'),
('Papaya and Pineapple Cause Miscarriage', 'Any papaya or pineapple immediately causes miscarriage or premature labor.', 'Ripe papaya and pineapple in moderation are safe; avoid raw papaya as a precaution.', 'Encourage nutritious ripe fruit and explain the distinction.', 'Nutrition'),
('Ghee in 9th Month Lubricates Birth Canal', 'Large amounts of ghee or oil lubricate the birth canal.', 'Food enters the digestive system, not the birth canal; excess can cause digestive distress and weight gain.', 'Recommend a balanced diet.', 'Labor & Delivery'),
('Cold Water & Cold Foods Cause Fetal Colds', 'Cold water or curd gives the fetus a cold in the womb.', 'The amniotic sac maintains temperature and food does not chill the fetus.', 'Encourage hydration and nutritious curd.', 'General Care')
ON CONFLICT DO NOTHING;
