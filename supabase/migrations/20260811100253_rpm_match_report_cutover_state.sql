
CREATE TABLE public.match_report_cutover_state (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  run_id uuid,
  expected_sheet_count integer,
  sheet_digest text,
  reconciled_at timestamptz,
  reconciled_by uuid,
  reconciled_by_label text,
  reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_report_cutover_ready_proof CHECK (
    status = 'pending'
    OR (
      expected_sheet_count > 0
      AND run_id IS NOT NULL
      AND length(sheet_digest) = 64
      AND reconciled_at IS NOT NULL
      AND length(trim(reconciled_by_label)) > 0
    )
  ),
  CONSTRAINT match_report_cutover_state_id_check CHECK (id = 'canonical'),
  CONSTRAINT match_report_cutover_state_status_check CHECK (status IN ('pending', 'ready'))
);
GRANT SELECT ON public.match_report_cutover_state TO authenticated;
GRANT ALL ON public.match_report_cutover_state TO service_role;
ALTER TABLE public.match_report_cutover_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_report_cutover_state_read ON public.match_report_cutover_state
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER match_report_cutover_state_set_updated_at
  BEFORE UPDATE ON public.match_report_cutover_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
