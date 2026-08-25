ALTER TABLE public.match_report_submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS confirmed_duplicate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reserved_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS report_uid text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'match_report_submissions_status_check'
      AND conrelid = 'public.match_report_submissions'::regclass
  ) THEN
    ALTER TABLE public.match_report_submissions
      ADD CONSTRAINT match_report_submissions_status_check
      CHECK (status IN ('pending', 'succeeded', 'ambiguous', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS match_report_submissions_key_uidx
  ON public.match_report_submissions (submission_key);

CREATE UNIQUE INDEX IF NOT EXISTS match_report_submissions_pending_fp_uidx
  ON public.match_report_submissions (fingerprint)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS match_report_submissions_succeeded_fp_idx
  ON public.match_report_submissions (fingerprint, submitted_at DESC)
  WHERE status = 'succeeded';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_report_submissions TO authenticated;
GRANT ALL ON public.match_report_submissions TO service_role;