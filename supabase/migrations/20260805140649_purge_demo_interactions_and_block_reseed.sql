-- Recovered verbatim from supabase_migrations.schema_migrations on the
-- production project. Applied 2026-08-05; the file was never committed, so the
-- schema could not be reproduced from the repository. Committed unchanged.

-- 1. Blocklist of permanently purged demo records
CREATE TABLE IF NOT EXISTS public.purged_demo_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  fingerprint text NOT NULL,
  reason text NOT NULL DEFAULT 'seeded demo data',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, fingerprint)
);

GRANT SELECT ON public.purged_demo_records TO authenticated;
GRANT ALL ON public.purged_demo_records TO service_role;

ALTER TABLE public.purged_demo_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purged_demo_records_select_super_admin"
  ON public.purged_demo_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "purged_demo_records_no_client_insert"
  ON public.purged_demo_records FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "purged_demo_records_no_client_update"
  ON public.purged_demo_records FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "purged_demo_records_no_client_delete"
  ON public.purged_demo_records FOR DELETE TO anon, authenticated USING (false);

-- 2. Deterministic fingerprint for an interaction
CREATE OR REPLACE FUNCTION public.interaction_demo_fingerprint(
  _goalkeeper_name text, _occurred_at date, _notes text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(
    lower(btrim(coalesce(_goalkeeper_name, ''))) || '|' ||
    coalesce(_occurred_at::text, '') || '|' ||
    lower(btrim(left(coalesce(_notes, ''), 120)))
  );
$$;

-- 3. Record the demo rows being purged, then delete them
INSERT INTO public.purged_demo_records (table_name, fingerprint, reason)
SELECT 'interactions',
       public.interaction_demo_fingerprint(goalkeeper_name, occurred_at, notes),
       'seeded demo data'
FROM public.interactions
WHERE goalkeeper_name = 'Toby Bell'
  AND notes ILIKE 'Just testing if this actually saves%'
ON CONFLICT (table_name, fingerprint) DO NOTHING;

DELETE FROM public.interactions
WHERE goalkeeper_name = 'Toby Bell'
  AND notes ILIKE 'Just testing if this actually saves%';

-- 4. Guard trigger: block re-seeding of purged demo records
CREATE OR REPLACE FUNCTION public.block_purged_demo_interactions()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS interactions_block_purged_demo ON public.interactions;
CREATE TRIGGER interactions_block_purged_demo
  BEFORE INSERT OR UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.block_purged_demo_interactions();

REVOKE EXECUTE ON FUNCTION public.interaction_demo_fingerprint(text, date, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_purged_demo_interactions() FROM anon, authenticated;
