CREATE TABLE public.interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  mentor_name text NOT NULL DEFAULT '',
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  goalkeeper_name text NOT NULL,
  gk_slug text NOT NULL DEFAULT '',
  interaction_type text NOT NULL,
  club text NOT NULL DEFAULT '',
  occurred_at date NOT NULL,
  notes text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '',
  follow_up text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT interactions_type_check CHECK (
    interaction_type = ANY (ARRAY[
      'Live Match Observation'::text,
      'Training Ground Visit'::text,
      'Coffee Catch Up'::text,
      'Phone Call'::text
    ])
  )
);

CREATE INDEX interactions_occurred_at_idx ON public.interactions (occurred_at DESC);
CREATE INDEX interactions_mentor_id_idx ON public.interactions (mentor_id);
CREATE INDEX interactions_player_id_idx ON public.interactions (player_id);

GRANT SELECT, INSERT ON public.interactions TO authenticated;
GRANT ALL ON public.interactions TO service_role;

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY interactions_select_privileged
  ON public.interactions
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'mentor'::app_role)
    OR has_role(auth.uid(), 'mentor_manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY interactions_insert_own
  ON public.interactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    mentor_id = auth.uid()
    AND (
      has_role(auth.uid(), 'mentor'::app_role)
      OR has_role(auth.uid(), 'mentor_manager'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

CREATE TRIGGER interactions_set_updated_at
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
