-- backend/supabase/migrations/006_add_profile_age.sql
-- Add age column to profiles table

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INT;
