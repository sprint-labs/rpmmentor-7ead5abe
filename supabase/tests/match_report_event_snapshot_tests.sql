-- Atomic calendar Match -> Match Report binding.
--
-- Run against a disposable local Supabase database after migrations:
--   supabase test db supabase/tests/match_report_event_snapshot_tests.sql
--
-- The transaction rolls back every fixture. Never run with --linked.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(47);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_reports_cache'
      AND column_name = 'calendar_event_player_id'
      AND data_type = 'uuid'
      AND is_nullable = 'YES'
  ),
  '1 the event player snapshot is a nullable uuid for legacy compatibility'
);

SELECT ok(
  (
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_reports_cache'
      AND column_name = 'calendar_event_player_id'
  ) IS NULL,
  '2 the snapshot has no inferred default or backfill value'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.match_reports_cache'::regclass
      AND tgname = 'match_reports_guard_event_snapshot'
      AND NOT tgisinternal
      AND position('BEFORE INSERT OR UPDATE' IN pg_get_triggerdef(oid)) > 0
  ),
  '3 the atomic guard runs before linked inserts and restorations'
);

SELECT ok(
  position(
    'FOR SHARE'
    IN pg_get_functiondef('public.match_reports_guard_event_snapshot()'::regprocedure)
  ) > 0,
  '4 the guard locks the calendar row in the report write transaction'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.match_reports_guard_event_snapshot()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.match_reports_guard_event_snapshot()',
    'EXECUTE'
  ),
  '5 browser roles cannot execute the security-definer guard directly'
);

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    'da7b0000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'snapshot-manager@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Snapshot Manager","initials":"SM"}'::jsonb,
    now(),
    now()
  ),
  (
    'da7b0000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'snapshot-mentor@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Snapshot Mentor","initials":"ST"}'::jsonb,
    now(),
    now()
  ),
  (
    'da7b0000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'snapshot-other-mentor@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Other Snapshot Mentor","initials":"OM"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('da7b0000-0000-0000-0000-000000000001', 'mentor_manager'),
  ('da7b0000-0000-0000-0000-000000000002', 'mentor'),
  ('da7b0000-0000-0000-0000-000000000003', 'mentor');

INSERT INTO public.players (id, full_name)
VALUES
  ('fa7b0000-0000-0000-0000-000000000001', 'Atomic Keeper'),
  ('fa7b0000-0000-0000-0000-000000000002', 'Changed Keeper');

INSERT INTO public.calendar_events (
  id,
  title,
  event_type,
  event_date,
  start_time,
  player_id,
  goalkeeper_name,
  assigned_mentor_id,
  assigned_mentor_name,
  participation_status,
  created_by,
  created_by_name
)
VALUES (
  'ca7b0000-0000-0000-0000-000000000001',
  'Atomic snapshot test match',
  'Match',
  date '2099-01-01',
  time '15:00',
  'fa7b0000-0000-0000-0000-000000000001',
  'Atomic Keeper',
  'da7b0000-0000-0000-0000-000000000002',
  'Snapshot Mentor',
  'played',
  'da7b0000-0000-0000-0000-000000000001',
  'Snapshot Manager'
);

INSERT INTO public.match_reports_cache (
  report_id,
  goalkeeper,
  coach,
  match_date,
  source
)
VALUES (
  'snapshot-standalone',
  'Legacy Standalone Keeper',
  'Legacy Coach',
  date '2098-12-31',
  'sheet'
);

SELECT is(
  (
    SELECT calendar_event_player_id
    FROM public.match_reports_cache
    WHERE report_id = 'snapshot-standalone'
  ),
  NULL,
  '6 standalone and historic-compatible reports retain a NULL snapshot'
);

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by, calendar_event_id, source
    ) VALUES (
      'snapshot-missing-player',
      'Atomic Keeper',
      'Snapshot Mentor',
      date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'app'
    )
  $$,
  'P0001',
  'A linked Match Report requires the expected calendar-event player',
  '7 a new linked report cannot omit its verified player snapshot'
);

SELECT lives_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id,
      goalkeeper,
      coach,
      match_date,
      submitted_by,
      calendar_event_id,
      calendar_event_player_id,
      source
    ) VALUES (
      'snapshot-valid',
      'Atomic Keeper',
      'Snapshot Mentor',
      date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001',
      'app'
    )
  $$,
  '8 the assigned Mentor can insert an exactly matched Played report'
);

SELECT is(
  (
    SELECT calendar_event_player_id
    FROM public.match_reports_cache
    WHERE report_id = 'snapshot-valid'
  ),
  'fa7b0000-0000-0000-0000-000000000001'::uuid,
  '9 the accepted report stores the exact event player snapshot'
);

SELECT lives_ok(
  $$
    UPDATE public.match_reports_cache
    SET comments = 'A safe score or comment correction.'
    WHERE report_id = 'snapshot-valid'
  $$,
  '10 ordinary report corrections do not re-interpret historic event state'
);

SELECT is(
  (
    SELECT calendar_event_player_id
    FROM public.match_reports_cache
    WHERE report_id = 'snapshot-valid'
  ),
  'fa7b0000-0000-0000-0000-000000000001'::uuid,
  '11 an ordinary correction retains the stored player snapshot'
);

SELECT throws_ok(
  $$
    UPDATE public.match_reports_cache
    SET calendar_event_player_id = 'fa7b0000-0000-0000-0000-000000000002'
    WHERE report_id = 'snapshot-valid'
  $$,
  'P0001',
  'match_reports_cache.calendar_event_player_id is immutable',
  '12 the player snapshot cannot be rewritten'
);

SELECT throws_ok(
  $$
    UPDATE public.match_reports_cache
    SET calendar_event_id = 'ca7b0000-0000-0000-0000-000000000099'
    WHERE report_id = 'snapshot-valid'
  $$,
  'P0001',
  'match_reports_cache.calendar_event_id is immutable',
  '13 the calendar-event provenance link cannot be rewritten'
);

UPDATE public.match_reports_cache
SET deleted_at = now()
WHERE report_id = 'snapshot-valid';

UPDATE public.calendar_events
SET
  player_id = 'fa7b0000-0000-0000-0000-000000000002',
  goalkeeper_name = 'Changed Keeper',
  participation_status = 'played'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id,
      goalkeeper,
      coach,
      match_date,
      submitted_by,
      calendar_event_id,
      calendar_event_player_id,
      source
    ) VALUES (
      'snapshot-stale-player',
      'Atomic Keeper',
      'Snapshot Mentor',
      date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001',
      'app'
    )
  $$,
  'P0001',
  'The Match event goalkeeper changed before the report was saved',
  '14 a player edit that wins the race rejects the stale report insert'
);

UPDATE public.calendar_events
SET
  player_id = 'fa7b0000-0000-0000-0000-000000000001',
  goalkeeper_name = 'Atomic Keeper'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-wrong-name', 'Different Name', 'Snapshot Mentor', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'The Match event goalkeeper name changed before the report was saved',
  '15 a goalkeeper-name mismatch is rejected at the canonical insert'
);

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-wrong-date', 'Atomic Keeper', 'Snapshot Mentor', date '2099-01-02',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'The Match event date changed before the report was saved',
  '16 a Match-date mismatch is rejected at the canonical insert'
);

UPDATE public.calendar_events
SET participation_status = 'did_not_play'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-did-not-play', 'Atomic Keeper', 'Snapshot Mentor', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'Confirm that this goalkeeper Played before saving a linked Match Report',
  '17 Did not play cannot acquire a linked Match Report'
);

UPDATE public.calendar_events
SET participation_status = 'not_confirmed'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-not-confirmed', 'Atomic Keeper', 'Snapshot Mentor', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'Confirm that this goalkeeper Played before saving a linked Match Report',
  '18 Not confirmed cannot acquire a linked Match Report'
);

UPDATE public.calendar_events
SET participation_status = 'played', status = 'cancelled'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-cancelled', 'Atomic Keeper', 'Snapshot Mentor', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'A cancelled Match event cannot receive a Match Report',
  '19 a cancelled Match cannot acquire a linked Match Report'
);

UPDATE public.calendar_events
SET status = 'scheduled', event_type = 'Training Ground Visit'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-training', 'Atomic Keeper', 'Snapshot Mentor', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'A linked Match Report requires a Match calendar event',
  '20 non-Match observations keep their separate write-up path'
);

UPDATE public.calendar_events
SET event_type = 'Match', participation_status = 'played'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-wrong-mentor', 'Atomic Keeper', 'Other Snapshot Mentor', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000003',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'That Match event is assigned to another mentor',
  '21 an unrelated Mentor cannot submit for another Mentor event'
);

-- This mirrors the application gates exactly: admin alone cannot submit a
-- report, but a user who is also a Mentor may use their admin role to write up
-- another Mentor's event.
INSERT INTO public.user_roles (user_id, role)
VALUES ('da7b0000-0000-0000-0000-000000000003', 'admin');

SELECT lives_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-admin-mentor', 'Atomic Keeper', 'Other Snapshot Mentor', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000003',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  '22 an Admin who is also a Mentor retains the existing write-any role parity'
);

UPDATE public.match_reports_cache
SET deleted_at = now()
WHERE report_id = 'snapshot-admin-mentor';

SELECT lives_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-manager', 'Atomic Keeper', 'Snapshot Manager', date '2099-01-01',
      'da7b0000-0000-0000-0000-000000000001',
      'ca7b0000-0000-0000-0000-000000000001',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  '23 a Mentor Manager retains permission to submit for another Mentor event'
);

UPDATE public.match_reports_cache
SET deleted_at = now()
WHERE report_id = 'snapshot-manager';

UPDATE public.calendar_events
SET participation_status = 'did_not_play'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$
    UPDATE public.match_reports_cache
    SET deleted_at = NULL
    WHERE report_id = 'snapshot-valid'
  $$,
  'P0001',
  'Confirm that this goalkeeper Played before saving a linked Match Report',
  '24 restoring a linked report also fails closed when the goalkeeper did not play'
);

UPDATE public.calendar_events
SET participation_status = 'played'
WHERE id = 'ca7b0000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$
    UPDATE public.match_reports_cache
    SET deleted_at = NULL
    WHERE report_id = 'snapshot-valid'
  $$,
  '25 a matched Played report may be explicitly restored'
);

SELECT is(
  (
    SELECT calendar_event_player_id
    FROM public.match_reports_cache
    WHERE report_id = 'snapshot-valid'
  ),
  'fa7b0000-0000-0000-0000-000000000001'::uuid,
  '26 restoration retains an existing authoritative snapshot'
);

UPDATE public.match_reports_cache
SET deleted_at = now()
WHERE report_id = 'snapshot-valid';

-- Simulate a linked tombstone that existed before the nullable snapshot column.
-- This is local, transactional fixture setup; the migration itself never
-- disables the guard or updates an existing report.
ALTER TABLE public.match_reports_cache
  DISABLE TRIGGER match_reports_guard_event_snapshot;

INSERT INTO public.match_reports_cache (
  report_id,
  goalkeeper,
  coach,
  match_date,
  submitted_by,
  calendar_event_id,
  calendar_event_player_id,
  source,
  deleted_at
)
VALUES (
  'snapshot-legacy-linked',
  'Atomic Keeper',
  'Snapshot Mentor',
  date '2099-01-01',
  'da7b0000-0000-0000-0000-000000000002',
  'ca7b0000-0000-0000-0000-000000000001',
  NULL,
  'app',
  now()
);

ALTER TABLE public.match_reports_cache
  ENABLE TRIGGER match_reports_guard_event_snapshot;

SELECT lives_ok(
  $$
    UPDATE public.match_reports_cache
    SET deleted_at = NULL
    WHERE report_id = 'snapshot-legacy-linked'
  $$,
  '27 a legacy linked tombstone can be revalidated and restored without a bulk backfill'
);

SELECT is(
  (
    SELECT calendar_event_player_id
    FROM public.match_reports_cache
    WHERE report_id = 'snapshot-legacy-linked'
  ),
  'fa7b0000-0000-0000-0000-000000000001'::uuid,
  '28 a legacy restoration captures its first trustworthy player snapshot'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.calendar_events'::regclass
      AND tgname = 'calendar_events_guard_linked_match_report_identity'
      AND NOT tgisinternal
      AND position('BEFORE UPDATE' IN pg_get_triggerdef(oid)) > 0
  ),
  '29 the reciprocal guard runs before calendar event edits'
);

SELECT throws_ok(
  $$
    UPDATE public.calendar_events
    SET
      player_id = 'fa7b0000-0000-0000-0000-000000000002',
      goalkeeper_name = 'Changed Keeper'
    WHERE id = 'ca7b0000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'This Match has an active report. Remove that report before changing its goalkeeper, date, or event type',
  '30 a report that wins the race prevents a later goalkeeper replacement'
);

SELECT throws_ok(
  $$
    UPDATE public.calendar_events
    SET event_date = date '2099-01-02'
    WHERE id = 'ca7b0000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'This Match has an active report. Remove that report before changing its goalkeeper, date, or event type',
  '31 a linked active report prevents a later fixture-date change'
);

SELECT throws_ok(
  $$
    UPDATE public.calendar_events
    SET event_type = 'Training Ground Visit'
    WHERE id = 'ca7b0000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'This Match has an active report. Remove that report before changing its goalkeeper, date, or event type',
  '32 a linked active report cannot be reassigned to a non-Match event'
);

SELECT lives_ok(
  $$
    UPDATE public.calendar_events
    SET title = 'Updated title without identity drift'
    WHERE id = 'ca7b0000-0000-0000-0000-000000000001'
  $$,
  '33 non-identity calendar corrections remain available after a report'
);

SELECT lives_ok(
  $$
    DELETE FROM public.calendar_events
    WHERE id = 'ca7b0000-0000-0000-0000-000000000001'
  $$,
  '34 deleting an event retains the existing ON DELETE SET NULL report contract'
);

SELECT ok(
  (
    SELECT
      calendar_event_id IS NULL
      AND calendar_event_player_id = 'fa7b0000-0000-0000-0000-000000000001'::uuid
    FROM public.match_reports_cache
    WHERE report_id = 'snapshot-legacy-linked'
  ),
  '35 event deletion detaches the FK but retains the historical player snapshot'
);

UPDATE public.match_reports_cache
SET deleted_at = now()
WHERE report_id = 'snapshot-legacy-linked';

SELECT lives_ok(
  $$
    UPDATE public.match_reports_cache
    SET deleted_at = NULL
    WHERE report_id = 'snapshot-legacy-linked'
  $$,
  '36 a detached historical report can still be restored without losing its snapshot'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.calendar_events_guard_linked_match_report_identity()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.calendar_events_guard_linked_match_report_identity()',
    'EXECUTE'
  ),
  '37 browser roles cannot execute the reciprocal security-definer guard directly'
);

INSERT INTO public.calendar_events (
  id,
  title,
  event_type,
  event_date,
  start_time,
  player_id,
  goalkeeper_name,
  assigned_mentor_id,
  assigned_mentor_name,
  participation_status,
  created_by,
  created_by_name
)
VALUES (
  'ca7b0000-0000-0000-0000-000000000002',
  'Blank goalkeeper guard test',
  'Match',
  date '2099-01-03',
  time '15:00',
  'fa7b0000-0000-0000-0000-000000000001',
  '   ',
  'da7b0000-0000-0000-0000-000000000002',
  'Snapshot Mentor',
  'played',
  'da7b0000-0000-0000-0000-000000000001',
  'Snapshot Manager'
);

SELECT throws_ok(
  $$
    INSERT INTO public.match_reports_cache (
      report_id, goalkeeper, coach, match_date, submitted_by,
      calendar_event_id, calendar_event_player_id, source
    ) VALUES (
      'snapshot-blank-name', '   ', 'Snapshot Mentor', date '2099-01-03',
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000002',
      'fa7b0000-0000-0000-0000-000000000001', 'app'
    )
  $$,
  'P0001',
  'The linked Match event has no canonical goalkeeper',
  '38 a blank event goalkeeper cannot become report or Duty of Care evidence'
);

UPDATE public.match_reports_cache
SET deleted_at = now()
WHERE report_id = 'snapshot-standalone';

SELECT throws_ok(
  $$
    UPDATE public.match_reports_cache
    SET
      deleted_at = NULL,
      calendar_event_player_id = 'fa7b0000-0000-0000-0000-000000000001'
    WHERE report_id = 'snapshot-standalone'
  $$,
  'P0001',
  'A calendar-event player snapshot requires a linked calendar event',
  '39 restoring an unlinked legacy report cannot invent a player snapshot'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'follow_up_basis'
      AND is_nullable = 'YES'
  ),
  '40 overdue notifications store a nullable eligibility basis for legacy compatibility'
);

INSERT INTO public.notifications (
  recipient_id,
  calendar_event_id,
  kind,
  title,
  body,
  link_path,
  created_by,
  read_at,
  follow_up_basis
)
VALUES (
  'da7b0000-0000-0000-0000-000000000002',
  'ca7b0000-0000-0000-0000-000000000002',
  'follow_up_overdue',
  'Historic false reminder',
  'Retained for audit',
  '/follow-ups',
  'da7b0000-0000-0000-0000-000000000001',
  now(),
  NULL
);

SELECT lives_ok(
  $$
    INSERT INTO public.notifications (
      recipient_id, calendar_event_id, kind, title, body, link_path, created_by,
      follow_up_basis
    ) VALUES (
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000002',
      'follow_up_overdue',
      'Validated Played reminder',
      'Participation was explicitly Played',
      '/follow-ups',
      'da7b0000-0000-0000-0000-000000000001',
      'match_played'
    )
  $$,
  '41 a validated Played reminder can coexist with a retained legacy false reminder'
);

SELECT throws_ok(
  $$
    INSERT INTO public.notifications (
      recipient_id, calendar_event_id, kind, title, body, link_path, created_by,
      follow_up_basis
    ) VALUES (
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000002',
      'follow_up_overdue',
      'Duplicate validated reminder',
      'Must deduplicate',
      '/follow-ups',
      'da7b0000-0000-0000-0000-000000000001',
      'match_played'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "notifications_overdue_basis_once_key"',
  '42 validated Played reminders remain unique per recipient and event'
);

UPDATE public.notifications
SET read_at = now()
WHERE calendar_event_id = 'ca7b0000-0000-0000-0000-000000000002'
  AND follow_up_basis = 'match_played';

UPDATE public.calendar_events
SET participation_status = 'did_not_play'
WHERE id = 'ca7b0000-0000-0000-0000-000000000002';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"da7b0000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

UPDATE public.calendar_events
SET participation_status = 'played'
WHERE id = 'ca7b0000-0000-0000-0000-000000000002';

RESET ROLE;

SELECT is(
  (
    SELECT read_at
    FROM public.notifications
    WHERE calendar_event_id = 'ca7b0000-0000-0000-0000-000000000002'
      AND follow_up_basis = 'match_played'
  ),
  NULL,
  '43 returning to Played re-opens the exact previously validated reminder'
);

SELECT isnt(
  (
    SELECT read_at
    FROM public.notifications
    WHERE calendar_event_id = 'ca7b0000-0000-0000-0000-000000000002'
      AND follow_up_basis IS NULL
  ),
  NULL,
  '44 returning to Played never re-opens a retained legacy false reminder'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.calendar_events'::regclass
      AND tgname = 'calendar_events_rearm_overdue_basis'
      AND NOT tgisinternal
  ),
  '45 obligation transitions have a validated-basis reminder rearm trigger'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.calendar_events_rearm_overdue_basis()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.calendar_events_rearm_overdue_basis()',
    'EXECUTE'
  ),
  '46 browser roles cannot execute the reminder rearm guard directly'
);

SELECT throws_ok(
  $$
    INSERT INTO public.notifications (
      recipient_id, calendar_event_id, kind, title, body, link_path, created_by,
      follow_up_basis
    ) VALUES (
      'da7b0000-0000-0000-0000-000000000002',
      'ca7b0000-0000-0000-0000-000000000002',
      'event_updated',
      'Invalid basis',
      'Only overdue reminders may carry eligibility provenance',
      '/calendar',
      'da7b0000-0000-0000-0000-000000000001',
      'match_played'
    )
  $$,
  '23514',
  'new row for relation "notifications" violates check constraint "notifications_follow_up_basis_check"',
  '47 non-overdue notifications cannot claim follow-up eligibility provenance'
);

SELECT * FROM finish();
ROLLBACK;
