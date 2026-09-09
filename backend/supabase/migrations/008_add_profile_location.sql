-- backend/supabase/migrations/008_add_profile_location.sql
-- Add location columns to profiles table and validation constraints

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS pincode_format_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT pincode_format_check
  CHECK (pincode IS NULL OR pincode = '' OR pincode ~ '^[0-9]{6}$');
