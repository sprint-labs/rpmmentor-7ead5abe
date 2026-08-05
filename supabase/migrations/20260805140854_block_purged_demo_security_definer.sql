-- Recovered verbatim from supabase_migrations.schema_migrations on the
-- production project. Applied 2026-08-05; the file was never committed.
--
-- The guard trigger reads public.purged_demo_records, which has RLS allowing
-- SELECT only to super_admin. Without SECURITY DEFINER the EXISTS check returns
-- nothing for an ordinary mentor, so the trigger silently passes and a purged
-- demo record could be re-created by exactly the users most likely to do it.

CREATE OR REPLACE FUNCTION public.block_purged_demo_interactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.purged_demo_records
    WHERE table_name = 'interactions'
      AND fingerprint = public.interaction_demo_fingerprint(NEW.goalkeeper_name, NEW.occurred_at, NEW.notes)
  ) THEN
    RAISE EXCEPTION 'This record was permanently removed as demo data and cannot be re-created';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_purged_demo_interactions() FROM PUBLIC, anon, authenticated;
