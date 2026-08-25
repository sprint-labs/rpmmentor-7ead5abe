DROP INDEX IF EXISTS public.match_report_submissions_pending_fingerprint_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS match_report_submissions_open_fingerprint_uidx
  ON public.match_report_submissions (fingerprint)
  WHERE status IN ('pending', 'ambiguous');

CREATE INDEX IF NOT EXISTS match_report_submissions_status_fingerprint_idx
  ON public.match_report_submissions (fingerprint, status);
