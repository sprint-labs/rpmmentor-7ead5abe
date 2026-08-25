CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  current_club text NOT NULL DEFAULT '',
  parent_club text,
  on_loan boolean NOT NULL DEFAULT false,
  league text NOT NULL DEFAULT '',
  nationality text NOT NULL DEFAULT '',
  instagram_url text,
  contract_until text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX players_full_name_lower_idx ON public.players (lower(full_name));

GRANT SELECT ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read players"
  ON public.players FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage players"
  ON public.players FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

