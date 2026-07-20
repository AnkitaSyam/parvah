-- Parvah Database Schema & Row Level Security (RLS) Setup

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (ASHA Workers)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    village_name TEXT,
    sub_center TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Patients
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asha_worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age INT NOT NULL,
    gestational_weeks INT DEFAULT 12,
    gravida INT DEFAULT 1,
    para INT DEFAULT 0,
    village TEXT,
    contact_phone TEXT,
    emergency_contact TEXT,
    blood_group TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Visits (Voice Visit Logs & Transcripts)
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    asha_worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    visit_date DATE DEFAULT CURRENT_DATE,
    audio_url TEXT,
    transcript TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'transcribed', 'analyzed', 'error')),
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Pregnancy Myths Reference Database (Fixed Catalog)
CREATE TABLE IF NOT EXISTS public.pregnancy_myths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    myth_title TEXT NOT NULL,
    common_myth TEXT NOT NULL,
    medical_fact TEXT NOT NULL,
    counseling_guidance TEXT NOT NULL,
    category TEXT DEFAULT 'nutrition',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Detected Myths (Per Visit AI Myth Matching)
CREATE TABLE IF NOT EXISTS public.detected_myths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    asha_worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    myth_id UUID REFERENCES public.pregnancy_myths(id) ON DELETE SET NULL,
    extracted_quote TEXT NOT NULL,
    explanation TEXT NOT NULL,
    severity_impact TEXT DEFAULT 'medium' CHECK (severity_impact IN ('low', 'medium', 'high')),
    is_addressed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Risk Timeline (Extracted Symptoms & Medical Risk Logs)
CREATE TABLE IF NOT EXISTS public.risk_timeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    asha_worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    symptom_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
    gestational_week INT,
    date_logged DATE DEFAULT CURRENT_DATE,
    flag_description TEXT NOT NULL,
    recommended_asha_action TEXT NOT NULL,
    requires_doctor_referral BOOLEAN DEFAULT FALSE,
    sms_alert_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ROW LEVEL SECURITY (RLS) POLICIES --

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pregnancy_myths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_myths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_timeline ENABLE ROW LEVEL SECURITY;

-- Profiles: ASHA Workers can read/update only their own profile
CREATE POLICY "ASHA worker profile access" ON public.profiles
    FOR ALL USING (auth.uid() = id);

-- Patients: ASHA Workers can access only their assigned patients
CREATE POLICY "ASHA worker patient access" ON public.patients
    FOR ALL USING (auth.uid() = asha_worker_id);

-- Visits: ASHA Workers can access only their visits
CREATE POLICY "ASHA worker visit access" ON public.visits
    FOR ALL USING (auth.uid() = asha_worker_id);

-- Pregnancy Myths: Read-only access for all authenticated ASHA workers
CREATE POLICY "Authenticated worker myths read access" ON public.pregnancy_myths
    FOR SELECT USING (auth.role() = 'authenticated');

-- Detected Myths: ASHA Workers can access only myths detected for their assigned patients
CREATE POLICY "ASHA worker detected myths access" ON public.detected_myths
    FOR ALL USING (auth.uid() = asha_worker_id);

-- Risk Timeline: ASHA Workers can access only risk timelines for their assigned patients
CREATE POLICY "ASHA worker risk timeline access" ON public.risk_timeline
    FOR ALL USING (auth.uid() = asha_worker_id);

-- SEED DATA: Fixed Rural Indian Pregnancy Myths Database --
INSERT INTO public.pregnancy_myths (myth_title, common_myth, medical_fact, counseling_guidance, category) VALUES
(
    'Eclipse Exposure Causes Deformity',
    'Pregnant women must not step outside or look at the sun/moon during an solar or lunar eclipse, or the baby will be born with a cleft lip or birth defect.',
    'Eclipses are natural astronomical events and have zero biological effect on fetus growth or genetics. Cleft lip and birth defects are caused by genetic or nutritional factors like Folic Acid deficiency.',
    'Counsel the family gently that stepping outside during an eclipse is safe. Emphasize taking daily Iron-Folic Acid (IFA) tablets which actively prevent real birth defects.',
    'Superstition'
),
(
    'Eating Less in 1st Trimester Keeps Baby Small',
    'Eating normal meals during early pregnancy makes the baby grow too big for normal delivery, so women should reduce their food intake.',
    'Restricting food intake leads to maternal anemia, low birth weight (LBW), and fetal growth restriction. The mother needs extra nutrition and calories from the start.',
    'Advise mother to eat 3 balanced meals plus 2 healthy snacks daily (dal, green vegetables, milk, eggs/pulses). Explain that proper nutrition ensures easy, safe delivery.',
    'Nutrition'
),
(
    'Saffron Milk Makes Baby Fair',
    'Drinking saffron (kesar) milk during pregnancy guarantees a fair skin complexion for the baby.',
    'Skin complexion is entirely determined by genetics (melanin genes). Saffron provides minor aroma and warmth but has no influence on baby skin color.',
    'Explain that all skin complexions are healthy and beautiful. Encourage drinking milk for its vital calcium and protein content rather than buying expensive saffron.',
    'Nutrition'
),
(
    'Iron-Folic Acid Tablets Make Fetus Dark or Heavy',
    'Taking government-provided Iron and Folic Acid (IFA) tablets makes the baby skin dark or makes the baby too heavy for delivery.',
    'IFA tablets prevent maternal anemia, postpartum hemorrhage, and preterm labor. They do not alter fetus skin color or cause unmanageable birth weight.',
    'Strongly encourage taking 1 IFA tablet daily after meals with lemon water or plain water (never tea/coffee). Reassure her that IFA saves mother and baby lives.',
    'Medication'
),
(
    'Papaya and Pineapple Cause Miscarriage',
    'Eating any papaya or pineapple during pregnancy will immediately induce abortion or premature labor.',
    'Ripe papaya and ripe pineapple eaten in moderate quantities are safe and provide Vitamin C and fiber. Only raw/unripe papaya latex contains high papain which can stimulate contractions in huge quantities.',
    'Clarify that fully ripe fruits are healthy, but recommend avoiding raw/unripe green papaya as a precautionary measure while enjoying ripe fruits safely.',
    'Nutrition'
),
(
    'Ghee in 9th Month Lubricates Birth Canal',
    'Drinking large amounts of pure ghee or oil in the 9th month will grease the birth canal and make delivery smooth and fast.',
    'Ghee goes into the stomach and digestive system, not the birth canal. Excess fat in late pregnancy causes diarrhea, cholesterol spikes, and excessive maternal weight gain.',
    'Recommend a balanced diet. Explain that uterine contractions and pelvic relaxation naturally guide delivery, and excess ghee will only cause digestive distress.',
    'Labor & Delivery'
),
(
    'Cold Water & Cold Foods Cause Fetal Colds',
    'Drinking cold water or eating curd during pregnancy gives the fetus a chronic cold and respiratory congestion in the womb.',
    'The amniotic sac maintains a constant temperature around 37°C. Cold foods eaten by the mother are warmed in the stomach and do not reach or chill the fetus.',
    'Encourage staying hydrated with clean water and consuming nutritious curd for calcium and digestion, regardless of temperature myths.',
    'General Care'
)
ON CONFLICT DO NOTHING;
