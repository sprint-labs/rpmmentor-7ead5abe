CREATE TABLE public.dashboard_click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  destination text NOT NULL,
  period_days integer,
  period_from timestamptz,
  period_to timestamptz,
  mentor_profile_id text,
  mentor_name text,
  effective_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.dashboard_click_events TO authenticated;
GRANT ALL ON public.dashboard_click_events TO service_role;

ALTER TABLE public.dashboard_click_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own click events"
  ON public.dashboard_click_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own click events"
  ON public.dashboard_click_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_dashboard_click_events_user_created ON public.dashboard_click_events(user_id, created_at DESC);
CREATE INDEX idx_dashboard_click_events_source ON public.dashboard_click_events(source);