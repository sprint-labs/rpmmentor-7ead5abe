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