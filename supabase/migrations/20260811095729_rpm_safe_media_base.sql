
CREATE TABLE public.media_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gk_id text NOT NULL,
  title text NOT NULL,
  notes text,
  media_type text NOT NULL,
  mime_type text,
  file_path text NOT NULL,
  file_size bigint,
  uploaded_by_id text,
  uploaded_by_name text,
  uploaded_by_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  rating_tags text[] NOT NULL DEFAULT '{}',
  thumbnail_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX media_assets_gk_id_idx ON public.media_assets (gk_id);
CREATE INDEX media_assets_created_at_idx ON public.media_assets (created_at DESC);
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON public.media_assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('gk-media', 'gk-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.media_audit_log (
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
GRANT SELECT, INSERT ON public.media_audit_log TO authenticated;
GRANT ALL ON public.media_audit_log TO service_role;
ALTER TABLE public.media_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX media_audit_log_created_at_idx ON public.media_audit_log (created_at DESC);

CREATE TABLE public.report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL,
  media_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  attached_by_id text,
  attached_by_name text,
  UNIQUE (report_id, media_id)
);
GRANT SELECT, INSERT, DELETE ON public.report_attachments TO authenticated;
GRANT ALL ON public.report_attachments TO service_role;
ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;
CREATE INDEX report_attachments_report_idx ON public.report_attachments (report_id);
