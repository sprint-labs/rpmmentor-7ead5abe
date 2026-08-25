
CREATE TABLE public.install_prompt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('shown','accepted','dismissed','failed','installed','manual_close','retry')),
  surface text NOT NULL CHECK (surface IN ('native','ios','failure')),
  platform text,
  browser text,
  user_agent text,
  declines integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.install_prompt_events TO authenticated;
GRANT ALL ON public.install_prompt_events TO service_role;

ALTER TABLE public.install_prompt_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own install events"
  ON public.install_prompt_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can view their own install events"
  ON public.install_prompt_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_install_prompt_events_event_created ON public.install_prompt_events(event, created_at DESC);
CREATE INDEX idx_install_prompt_events_user_created ON public.install_prompt_events(user_id, created_at DESC);
