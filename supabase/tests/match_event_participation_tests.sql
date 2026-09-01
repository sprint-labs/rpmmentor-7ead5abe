-- Match event participation: schema, audit and existing calendar RLS contract.
--
-- Run against a disposable local Supabase database after migrations:
--   supabase test db supabase/tests/match_event_participation_tests.sql
--
-- The transaction rolls back every fixture. Never run with --linked.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(15);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.calendar_events'::regclass),
  '1 calendar_events keeps RLS enabled'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events'
      AND column_name = 'participation_status'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ),
  '2 participation_status is required text'
);

SELECT ok(
  (
    SELECT column_default LIKE '%not_confirmed%'
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events'
      AND column_name = 'participation_status'
  ),
  '3 participation_status defaults to not_confirmed'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.calendar_events'::regclass
      AND conname = 'calendar_events_participation_status_check'
      AND contype = 'c'
      AND position('not_confirmed' IN pg_get_constraintdef(oid)) > 0
      AND position('played' IN pg_get_constraintdef(oid)) > 0
      AND position('did_not_play' IN pg_get_constraintdef(oid)) > 0
  ),
  '4 participation_status is constrained to the three supported states'
);

SELECT ok(
  position(
    'NEW.participation_status IS DISTINCT FROM OLD.participation_status'
    IN pg_get_functiondef('public.calendar_events_write_audit()'::regprocedure)
  ) > 0,
  '5 the audit trigger watches participation-only updates'
);

SELECT ok(
  position(
    'participation_changed'
    IN pg_get_functiondef('public.calendar_events_write_audit()'::regprocedure)
  ) > 0,
  '6 the audit trigger records a dedicated participation action'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.calendar_events_write_audit()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.calendar_events_write_audit()',
    'EXECUTE'
  ),
  '7 browser roles cannot execute the audit function directly'
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
    'da7a0000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'participation-manager@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Participation Manager","initials":"PM"}'::jsonb,
    now(),
    now()
  ),
  (
    'da7a0000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'participation-mentor@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Participation Mentor","initials":"PT"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('da7a0000-0000-0000-0000-000000000001', 'mentor_manager'),
  ('da7a0000-0000-0000-0000-000000000002', 'mentor');

INSERT INTO public.calendar_events (
  id,
  title,
  event_type,
  event_date,
  start_time,
  assigned_mentor_id,
  assigned_mentor_name,
  created_by,
  created_by_name
)
VALUES (
  'ca1e0000-0000-0000-0000-000000000001',
  'Participation test match',
  'Match',
  date '2099-01-01',
  time '15:00',
  'da7a0000-0000-0000-0000-000000000002',
  'Participation Mentor',
  'da7a0000-0000-0000-0000-000000000001',
  'Participation Manager'
);

SELECT is(
  (
    SELECT participation_status
    FROM public.calendar_events
    WHERE id = 'ca1e0000-0000-0000-0000-000000000001'
  ),
  'not_confirmed',
  '8 new and historical-compatible event rows default safely'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.calendar_event_audit
    WHERE calendar_event_id = 'ca1e0000-0000-0000-0000-000000000001'
      AND action = 'created'
      AND after_values ->> 'participation_status' = 'not_confirmed'
  ),
  '9 event creation audit includes participation_status'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"da7a0000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

WITH updated AS (
  UPDATE public.calendar_events
  SET participation_status = 'played'
  WHERE id = 'ca1e0000-0000-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::integer FROM updated),
  1,
  '10 a Mentor Manager can update participation'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.calendar_event_audit
    WHERE calendar_event_id = 'ca1e0000-0000-0000-0000-000000000001'
      AND action = 'participation_changed'
      AND changed_by = 'da7a0000-0000-0000-0000-000000000001'
      AND before_values = '{"participation_status":"not_confirmed"}'::jsonb
      AND after_values = '{"participation_status":"played"}'::jsonb
  ),
  1,
  '11 a participation-only update writes one attributable audit row'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"da7a0000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

WITH updated AS (
  UPDATE public.calendar_events
  SET participation_status = 'did_not_play'
  WHERE id = 'ca1e0000-0000-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::integer FROM updated),
  0,
  '12 a Mentor cannot update participation through existing RLS'
);

RESET ROLE;

SELECT is(
  (
    SELECT participation_status
    FROM public.calendar_events
    WHERE id = 'ca1e0000-0000-0000-0000-000000000001'
  ),
  'played',
  '13 a blocked Mentor update leaves participation unchanged'
);

SELECT throws_ok(
  $$
    UPDATE public.calendar_events
    SET participation_status = 'started'
    WHERE id = 'ca1e0000-0000-0000-0000-000000000001'
  $$,
  '23514',
  NULL,
  '14 unsupported participation states are rejected'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
SET LOCAL ROLE anon;

WITH updated AS (
  UPDATE public.calendar_events
  SET participation_status = 'did_not_play'
  WHERE id = 'ca1e0000-0000-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::integer FROM updated),
  0,
  '15 anonymous callers retain no calendar update permission'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
