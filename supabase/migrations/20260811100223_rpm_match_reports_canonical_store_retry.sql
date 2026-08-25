-- Match Reports: promote `match_reports_cache` to the CANONICAL store.
--
-- Google Sheets was the source of truth; from this migration on Supabase is,
-- and the Sheet is a dormant archive / rollback source only. The table keeps
-- its name (renaming is cleanup, not correctness) but stops being a mirror:
-- rows are now written directly by `submitMatchReport` and are never pruned to
-- match the Sheet.
--
-- Nothing here touches authentication, users, roles, interactions or any other
-- table. Existing columns keep their meaning; only additive columns are new.

ALTER TABLE public.match_reports_cache
  -- Pre-Team identity (`mr_…`). Persisted so historic detail URLs resolve from
  -- the database instead of being recomputed from a Sheet read.
  ADD COLUMN IF NOT EXISTS legacy_report_id text,
  -- Canonical submission timestamp. NULL for historical Sheet rows, which have
  -- no submit time — `synced_at` is import/reconciliation time and must never
  -- be read as one.
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  -- auth.users id of the coach who submitted through the app (NULL for the
  -- backfilled Sheet history). Deliberately no FK: report history must survive
  -- account changes, and this migration must not couple to the auth tables.
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  -- Idempotency key of the submission that created this row. A hard database
  -- guarantee that one submission key can only ever produce one report.
  ADD COLUMN IF NOT EXISTS submission_key text,
  -- Soft delete. Reports are tombstoned rather than removed so that (a) the
  -- historical Sheet archive can be re-imported without resurrecting a deleted
  -- report and (b) no historical data is destroyed.
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Everything already in the table arrived from the Sheet mirror.
UPDATE public.match_reports_cache
   SET source = 'sheet'
 WHERE source IS NULL;

-- One canonical report per submission key.
CREATE UNIQUE INDEX IF NOT EXISTS match_reports_cache_submission_key_uidx
  ON public.match_reports_cache (submission_key)
  WHERE submission_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS match_reports_cache_legacy_report_id_idx
  ON public.match_reports_cache (legacy_report_id)
  WHERE legacy_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS match_reports_cache_coach_idx
  ON public.match_reports_cache (coach);

CREATE INDEX IF NOT EXISTS match_reports_cache_live_match_date_idx
  ON public.match_reports_cache (match_date DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.match_reports_cache IS
  'CANONICAL Match Reports store (runtime source of truth). Historically a mirror of the "GKHQ Propietry Data Hub" Google Sheet, which is now a dormant archive/rollback source only — no runtime read or write path depends on it. Rows are written by submitMatchReport and by the one-time Sheet backfill; they are never pruned against the Sheet.';

COMMENT ON COLUMN public.match_reports_cache.report_id IS
  'Deterministic identity (mr2_<hash> of goalkeeper|team|opponent|match_date), with a ~2/~3 occurrence suffix for confirmed duplicate fixtures. Stable across the Sheet backfill and app submissions.';
COMMENT ON COLUMN public.match_reports_cache.legacy_report_id IS
  'Pre-Team identity (mr_<hash> of goalkeeper|match_date|opponent). Resolution only — never the primary identity.';
COMMENT ON COLUMN public.match_reports_cache.row_index IS
  'Legacy Google Sheet row number (1-based) this report was imported from. Traceability back to the archive only; nothing reads or writes the Sheet by it at runtime.';
COMMENT ON COLUMN public.match_reports_cache.synced_at IS
  'Import/reconciliation time, NOT a submit time. Never use for duplicate windows — use submitted_at.';
COMMENT ON COLUMN public.match_reports_cache.submitted_at IS
  'When the report was submitted through the app. NULL for backfilled Sheet history.';
COMMENT ON COLUMN public.match_reports_cache.source IS
  'Provenance: ''sheet'' for the one-time Google Sheets backfill, ''app'' for reports submitted to Supabase directly.';
COMMENT ON COLUMN public.match_reports_cache.deleted_at IS
  'Soft-delete tombstone. Non-NULL rows are excluded from every runtime read and are skipped (not resurrected) by a re-run of the Sheet backfill.';
