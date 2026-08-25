CREATE TABLE public.match_report_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  submission_key text NOT NULL UNIQUE,
  fingerprint text NOT NULL,
  goalkeeper text NOT NULL,
  team text NOT NULL DEFAULT '',
  opponent text NOT NULL DEFAULT '',
  match_date date,
  report_id text,
  sheet_row_index integer,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.match_report_submissions TO authenticated;
GRANT ALL ON public.match_report_submissions TO service_role;

ALTER TABLE public.match_report_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_report_submissions_insert_own"
  ON public.match_report_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "match_report_submissions_select_scoped"
  ON public.match_report_submissions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE INDEX match_report_submissions_fingerprint_idx
  ON public.match_report_submissions (fingerprint, submitted_at DESC);
CREATE INDEX match_report_submissions_submitted_at_idx
  ON public.match_report_submissions (submitted_at DESC);

CREATE TRIGGER match_report_submissions_set_updated_at
  BEFORE UPDATE ON public.match_report_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();