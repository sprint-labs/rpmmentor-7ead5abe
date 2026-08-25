ALTER TABLE public.match_report_submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_uid text;

CREATE OR REPLACE FUNCTION public.match_report_submissions_status_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending','succeeded','ambiguous','failed') THEN
    RAISE EXCEPTION 'invalid submission status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_report_submissions_status_check ON public.match_report_submissions;
CREATE TRIGGER match_report_submissions_status_check
BEFORE INSERT OR UPDATE ON public.match_report_submissions
FOR EACH ROW EXECUTE FUNCTION public.match_report_submissions_status_check();

CREATE UNIQUE INDEX IF NOT EXISTS match_report_submissions_key_uidx
  ON public.match_report_submissions (submission_key);

CREATE UNIQUE INDEX IF NOT EXISTS match_report_submissions_pending_fingerprint_uidx
  ON public.match_report_submissions (fingerprint)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS match_report_submissions_fingerprint_idx
  ON public.match_report_submissions (fingerprint, submitted_at DESC);
