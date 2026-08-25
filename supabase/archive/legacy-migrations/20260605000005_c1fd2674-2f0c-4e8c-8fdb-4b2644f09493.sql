
CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gk_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  media_type TEXT NOT NULL,
  mime_type TEXT,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  uploaded_by_id TEXT,
  uploaded_by_name TEXT,
  uploaded_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO anon, authenticated;
GRANT ALL ON public.media_assets TO service_role;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_assets_select_all" ON public.media_assets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "media_assets_insert_all" ON public.media_assets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "media_assets_delete_all" ON public.media_assets FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX media_assets_gk_id_idx ON public.media_assets (gk_id);
CREATE INDEX media_assets_created_at_idx ON public.media_assets (created_at DESC);

-- Storage policies for the gk-media bucket
CREATE POLICY "gk_media_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'gk-media');
CREATE POLICY "gk_media_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'gk-media');
CREATE POLICY "gk_media_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'gk-media');
