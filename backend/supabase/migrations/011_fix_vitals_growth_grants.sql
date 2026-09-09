-- Grant table permissions to authenticated users and service_role
GRANT ALL ON public.visit_vitals TO authenticated, service_role;
GRANT ALL ON public.child_growth TO authenticated, service_role;
GRANT ALL ON public.immunization_records TO authenticated, service_role;

-- Ensure sequences (if any) are accessible
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Ensure future tables created in public schema inherit grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
