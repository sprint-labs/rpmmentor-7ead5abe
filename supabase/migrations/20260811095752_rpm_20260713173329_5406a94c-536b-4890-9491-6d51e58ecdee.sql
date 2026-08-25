
CREATE TABLE public.match_reports_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id text NOT NULL UNIQUE,
  row_index integer,
  goalkeeper text NOT NULL,
  coach text NOT NULL,
  team text,
  opponent text,
  match_date date,
  protect_goal smallint,
  protect_space smallint,
  protect_air smallint,
  control_play smallint,
  change_play smallint,
  psych smallint,
  physical smallint,
  average numeric(3,1),
  comments text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.match_reports_cache TO authenticated;
GRANT ALL  ON public.match_reports_cache TO service_role;

ALTER TABLE public.match_reports_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_reports_cache_select_auth"
ON public.match_reports_cache FOR SELECT
TO authenticated USING (true);

CREATE TRIGGER match_reports_cache_set_updated_at
BEFORE UPDATE ON public.match_reports_cache
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_match_reports_cache_match_date ON public.match_reports_cache (match_date DESC);
CREATE INDEX idx_match_reports_cache_goalkeeper ON public.match_reports_cache (goalkeeper);
