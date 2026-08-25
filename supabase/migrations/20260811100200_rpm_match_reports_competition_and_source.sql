
ALTER TABLE public.match_reports_cache
  ADD COLUMN IF NOT EXISTS competition text,
  ADD COLUMN IF NOT EXISTS source text;
