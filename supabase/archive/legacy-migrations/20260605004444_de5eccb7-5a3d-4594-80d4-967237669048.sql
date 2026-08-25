
-- 1. Extend media_assets
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS rating_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Allow UPDATE on media_assets (currently only insert/select/delete exist)
DROP POLICY IF EXISTS media_assets_update_all ON public.media_assets;
CREATE POLICY media_assets_update_all ON public.media_assets
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS media_assets_set_updated_at ON public.media_assets;
CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Audit log
CREATE TABLE IF NOT EXISTS public.media_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  media_id uuid,
  media_title text,
  gk_id text,
  actor_id text,
  actor_name text,
  actor_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT ON public.media_audit_log TO anon, authenticated;
GRANT ALL ON public.media_audit_log TO service_role;
ALTER TABLE public.media_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_audit_select ON public.media_audit_log
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY media_audit_insert ON public.media_audit_log
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS media_audit_log_created_at_idx ON public.media_audit_log (created_at DESC);

-- 3. Report attachments
CREATE TABLE IF NOT EXISTS public.report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL,
  media_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  attached_by_id text,
  attached_by_name text,
  UNIQUE (report_id, media_id)
);
GRANT SELECT, INSERT, DELETE ON public.report_attachments TO anon, authenticated;
GRANT ALL ON public.report_attachments TO service_role;
ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_attachments_select ON public.report_attachments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY report_attachments_insert ON public.report_attachments
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY report_attachments_delete ON public.report_attachments
  FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS report_attachments_report_idx ON public.report_attachments (report_id);
