-- Bulletin Board MVP: schema, grants and row-level security contract.
--
-- Run against a disposable local Supabase database after migrations:
--   supabase test db supabase/tests/bulletin_board_rls_tests.sql
--
-- The transaction rolls back every fixture. Never run with --linked.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(56);

-- ---------------------------------------------------------------------------
-- Schema and API surface
-- ---------------------------------------------------------------------------

SELECT ok(
  to_regclass('public.bulletin_items') IS NOT NULL,
  '1 bulletin_items exists'
);

SELECT ok(
  to_regclass('public.bulletin_updates') IS NOT NULL,
  '2 bulletin_updates exists'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bulletin_items'::regclass),
  '3 bulletin_items has RLS enabled'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bulletin_updates'::regclass),
  '4 bulletin_updates has RLS enabled'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.bulletin_items', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.bulletin_items', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.bulletin_items', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.bulletin_items', 'DELETE'),
  '5 anon has no bulletin_items privileges'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.bulletin_updates', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.bulletin_updates', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.bulletin_updates', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.bulletin_updates', 'DELETE'),
  '6 anon has no bulletin_updates privileges'
);

SELECT is(
  (
    SELECT array_agg(privilege_type::text ORDER BY privilege_type)::text
    FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'bulletin_items'
  ),
  '{INSERT,SELECT}',
  '7 authenticated receives only table-level INSERT and SELECT on items'
);

SELECT is(
  (
    SELECT array_agg(column_name::text ORDER BY column_name)::text
    FROM information_schema.column_privileges
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'bulletin_items'
      AND privilege_type = 'UPDATE'
  ),
  '{details,due_date,next_action,owner_id,status,subject_name,subject_type,title,version}',
  '8 authenticated UPDATE excludes trigger-derived display snapshots'
);

SELECT is(
  (
    SELECT array_agg(privilege_type::text ORDER BY privilege_type)::text
    FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'bulletin_updates'
  ),
  '{INSERT,SELECT}',
  '9 updates are append-only for authenticated callers'
);

SELECT ok(
  NOT has_table_privilege('service_role', 'public.bulletin_items', 'DELETE')
    AND NOT has_table_privilege('service_role', 'public.bulletin_updates', 'DELETE'),
  '10 service_role receives no hard-delete grant'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('bulletin_items', 'bulletin_updates')
      AND cmd = 'DELETE'
  ),
  '11 neither table has a delete policy'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.bulletin_items_prepare_write()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.bulletin_updates_prepare_write()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.bulletin_updates_touch_parent()',
    'EXECUTE'
  ),
  '12 trigger functions are not directly executable through the public API'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'rpm_private.bulletin_owner_is_operational(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'rpm_private.bulletin_owner_is_operational(uuid)',
    'EXECUTE'
  ),
  '13 the private owner validator is available only to authenticated policy evaluation'
);

SELECT ok(
  to_regclass('public.bulletin_items_board_status_activity_idx') IS NOT NULL
    AND to_regclass('public.bulletin_items_owner_open_activity_idx') IS NOT NULL
    AND to_regclass('public.bulletin_items_creator_open_activity_idx') IS NOT NULL
    AND to_regclass('public.bulletin_items_open_due_idx') IS NOT NULL
    AND to_regclass('public.bulletin_updates_item_created_idx') IS NOT NULL,
  '14 board, ownership, due-date and history query paths are indexed'
);

SELECT is(
  (
    SELECT array_agg(
      (tablename || ':' || policyname)::text
      ORDER BY tablename, policyname
    )::text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('bulletin_items', 'bulletin_updates')
  ),
  '{bulletin_items:bulletin_items_insert_operational,bulletin_items:bulletin_items_select_scoped,bulletin_items:bulletin_items_update_management,bulletin_updates:bulletin_updates_insert_owner_creator_or_management,bulletin_updates:bulletin_updates_select_scoped}',
  '14a only the five reviewed Bulletin Board policies are active'
);

-- ---------------------------------------------------------------------------
-- Transactional users and fixtures
-- ---------------------------------------------------------------------------

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
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'bulletin-manager@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Bulletin Manager","initials":"BM"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'bulletin-mentor-a@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Mentor A","initials":"MA"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'bulletin-mentor-b@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Mentor B","initials":"MB"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'bulletin-admin@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Bulletin Admin","initials":"BA"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'bulletin-roleless@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Roleless User","initials":"RU"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    'authenticated',
    'authenticated',
    'bulletin-departing@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Departing Mentor","initials":"DM"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000007',
    'authenticated',
    'authenticated',
    'bulletin-super-admin@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Bulletin Super Admin","initials":"BS"}'::jsonb,
    now(),
    now()
  );

UPDATE public.profiles
SET name = CASE id
  WHEN '00000000-0000-0000-0000-000000000001' THEN 'Bulletin Manager'
  WHEN '00000000-0000-0000-0000-000000000002' THEN 'Mentor A'
  WHEN '00000000-0000-0000-0000-000000000003' THEN 'Mentor B'
  WHEN '00000000-0000-0000-0000-000000000004' THEN 'Bulletin Admin'
  WHEN '00000000-0000-0000-0000-000000000005' THEN 'Roleless User'
  WHEN '00000000-0000-0000-0000-000000000006' THEN 'Departing Mentor'
  WHEN '00000000-0000-0000-0000-000000000007' THEN 'Bulletin Super Admin'
END
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000007'
);

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'mentor_manager'),
  ('00000000-0000-0000-0000-000000000002', 'mentor'),
  ('00000000-0000-0000-0000-000000000003', 'mentor'),
  ('00000000-0000-0000-0000-000000000004', 'admin'),
  ('00000000-0000-0000-0000-000000000006', 'mentor'),
  ('00000000-0000-0000-0000-000000000007', 'super_admin');

INSERT INTO public.bulletin_items (
  id,
  kind,
  title,
  subject_type,
  subject_name,
  status,
  owner_id,
  created_by
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'deal',
    'Mentor A owned',
    'club',
    'Club A',
    'open',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'lead',
    'Mentor B owned',
    'player',
    'Player B',
    'working',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'mandate',
    'Created by A and assigned to B',
    'club',
    'Club C',
    'blocked',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'daily_update',
    'Management queue',
    'other',
    'Internal',
    'open',
    NULL,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    'daily_update',
    'Departing owner snapshot',
    'other',
    'Account lifecycle',
    'open',
    '00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    'daily_update',
    'Departing creator snapshot',
    'other',
    'Account lifecycle',
    'open',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000006'
  );

-- ---------------------------------------------------------------------------
-- Row visibility
-- ---------------------------------------------------------------------------

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT array_agg(id::text ORDER BY id)::text FROM public.bulletin_items),
  '{10000000-0000-0000-0000-000000000001}',
  '15 mentor A sees only their current assignment'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT array_agg(id::text ORDER BY id)::text FROM public.bulletin_items),
  '{10000000-0000-0000-0000-000000000002,10000000-0000-0000-0000-000000000003}',
  '16 mentor B sees both current assignments'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_items),
  6,
  '17 Mentor Manager sees the team board'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_items),
  6,
  '17a Admin sees the team board'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000007","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_items),
  6,
  '17b Super Admin sees the team board'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_items),
  0,
  '18 authenticated users without an RPM role see no Bulletin Board rows'
);

-- ---------------------------------------------------------------------------
-- Item creation and structured management edits
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000001',
      'daily_update',
      'Mentor self-created update',
      'other',
      'Mentor A work',
      '00000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  NULL,
  '19 mentor cannot create Bulletin Board work'
);

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_items),
  1,
  '20 rejected mentor creation leaves only the existing assignment visible'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id, created_by
    ) VALUES (
      '11000000-0000-0000-0000-000000000002',
      'deal',
      'Forged creator',
      'club',
      'Club forged',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  NULL,
  '21 mentor cannot forge created_by'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000003',
      'deal',
      'Assigned to someone else',
      'club',
      'Club other',
      '00000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  NULL,
  '22 mentor cannot create work owned by somebody else'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000004',
      'lead',
      'Unassigned mentor item',
      'player',
      'Player unassigned',
      NULL
    )
  $$,
  '42501',
  NULL,
  '23 mentor cannot create an unassigned queue item'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, status, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000005',
      'mandate',
      'Mentor bypassed initial status',
      'club',
      'Club status',
      'working',
      '00000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  NULL,
  '24 mentor-created work must start open'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000006',
      'lead',
      'Roleless insert',
      'player',
      'Player roleless',
      '00000000-0000-0000-0000-000000000005'
    )
  $$,
  '42501',
  NULL,
  '25 roleless authenticated user cannot create Bulletin Board work'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000007',
      'daily_update',
      'Manager unassigned queue',
      'other',
      'Internal queue',
      NULL
    )
  $$,
  '26 management can create an unassigned queue item'
);

SELECT lives_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000008',
      'deal',
      'Manager assigns Mentor A',
      'club',
      'Club assigned',
      '00000000-0000-0000-0000-000000000002'
    )
  $$,
  '27 management can assign work to an operational mentor'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000009',
      'deal',
      'Manager assigns roleless user',
      'club',
      'Club invalid owner',
      '00000000-0000-0000-0000-000000000005'
    )
  $$,
  '42501',
  NULL,
  '28 management cannot assign work to a non-operational account'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000010',
      'other_board',
      'Invalid board',
      'other',
      'Invalid board',
      NULL
    )
  $$,
  '23514',
  NULL,
  '29 only the four MVP board kinds are accepted'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_items (
      id, kind, title, subject_type, subject_name, status, owner_id
    ) VALUES (
      '11000000-0000-0000-0000-000000000011',
      'lead',
      'Invalid status',
      'player',
      'Invalid status',
      'won',
      NULL
    )
  $$,
  '23514',
  NULL,
  '30 only the shared MVP statuses are accepted'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

UPDATE public.bulletin_items
SET
  title = 'Mentor should not edit',
  owner_id = '00000000-0000-0000-0000-000000000003',
  version = 2
WHERE id = '10000000-0000-0000-0000-000000000001';

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.bulletin_items
    WHERE id = '10000000-0000-0000-0000-000000000001'
      AND title = 'Mentor A owned'
      AND owner_id = '00000000-0000-0000-0000-000000000002'
      AND version = 1
  ),
  '31 mentor structured edits and reassignment are filtered by RLS'
);

SELECT lives_ok(
  $$
    UPDATE public.bulletin_items
    SET title = 'Manager updated title', version = 2
    WHERE id = '10000000-0000-0000-0000-000000000002'
      AND version = 1
  $$,
  '32 management can perform an optimistic structured update'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.bulletin_items
    WHERE id = '10000000-0000-0000-0000-000000000002'
      AND title = 'Manager updated title'
      AND version = 2
  ),
  '33 the timestamp trigger does not double-increment the supplied version'
);

SELECT throws_ok(
  $$
    UPDATE public.bulletin_items
    SET owner_id = '00000000-0000-0000-0000-000000000005',
        version = 2
    WHERE id = '10000000-0000-0000-0000-000000000001'
      AND version = 1
  $$,
  '42501',
  NULL,
  '34 management cannot update ownership to a non-operational account'
);

SELECT throws_ok(
  $$
    UPDATE public.bulletin_items
    SET owner_id = NULL,
        owner_name = 'Forged display owner',
        version = 2
    WHERE id = '11000000-0000-0000-0000-000000000008'
      AND version = 1
  $$,
  '42501',
  NULL,
  '35 direct API callers cannot write the owner display snapshot'
);

SELECT lives_ok(
  $$
    UPDATE public.bulletin_items
    SET owner_id = NULL, version = 2
    WHERE id = '11000000-0000-0000-0000-000000000008'
      AND version = 1
  $$,
  '36 management can explicitly unassign an item without writing a snapshot'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.bulletin_items
    WHERE id = '11000000-0000-0000-0000-000000000008'
      AND owner_id IS NULL
      AND owner_name = ''
      AND version = 2
  ),
  '37 authenticated unassign clears the owner snapshot canonically'
);

-- ---------------------------------------------------------------------------
-- Append-only progress updates
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO public.bulletin_updates (id, bulletin_id, body)
    VALUES (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'Mentor A progressed their item.'
    )
  $$,
  '38 assigned mentor can append progress'
);

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_updates),
  1,
  '39 assigned mentor sees progress on their current work'
);

SELECT is(
  (
    SELECT version
    FROM public.bulletin_items
    WHERE id = '10000000-0000-0000-0000-000000000001'
  ),
  2,
  '39a a mentor progress note advances the parent version exactly once'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_updates (id, bulletin_id, author_id, body)
    VALUES (
      '20000000-0000-0000-0000-000000000007',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000003',
      'Mentor A must not forge Mentor B as the author.'
    )
  $$,
  '42501',
  NULL,
  '39b an assigned mentor cannot forge the update author'
);

SELECT lives_ok(
  $$
    INSERT INTO public.bulletin_updates (id, bulletin_id, body)
    VALUES (
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003',
      'Creator A added context after reassignment.'
    )
  $$,
  '42501',
  NULL,
  '40 mentor cannot append to work they created before reassignment'
);

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_updates (id, bulletin_id, body)
    VALUES (
      '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000002',
      'Mentor A must not reach Mentor B private work.'
    )
  $$,
  '42501',
  NULL,
  '41 mentor cannot append to another mentor private item'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_updates (id, bulletin_id, body)
    VALUES (
      '20000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000003',
      'Assigned Mentor B progressed the item.'
    )
  $$,
  '42 assigned mentor B can append progress'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.bulletin_updates (id, bulletin_id, body)
    VALUES (
      '20000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000001',
      'Roleless users cannot contribute.'
    )
  $$,
  '42501',
  NULL,
  '43 roleless authenticated user cannot append progress'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO public.bulletin_updates (id, bulletin_id, body)
    VALUES (
      '20000000-0000-0000-0000-000000000006',
      '10000000-0000-0000-0000-000000000002',
      'Management can update any team item.'
    )
  $$,
  '44 management can append progress to any team item'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_updates),
  1,
  '45 mentor A sees only update history for their current assignment'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_updates),
  2,
  '46 mentor B sees update history for both current assignments'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.bulletin_updates),
  3,
  '47 management sees all team update history'
);

SELECT throws_ok(
  $$
    UPDATE public.bulletin_updates
    SET body = 'History must remain immutable.'
    WHERE id = '20000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  NULL,
  '48 appended updates cannot be edited'
);

SELECT throws_ok(
  $$
    DELETE FROM public.bulletin_updates
    WHERE id = '20000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  NULL,
  '49 appended updates cannot be hard-deleted'
);

SELECT throws_ok(
  $$
    DELETE FROM public.bulletin_items
    WHERE id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  NULL,
  '50 Bulletin Board items cannot be hard-deleted'
);

-- Account removal nulls canonical foreign keys but retains historical names.
RESET ROLE;
DELETE FROM auth.users
WHERE id = '00000000-0000-0000-0000-000000000006';

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.bulletin_items
    WHERE id = '10000000-0000-0000-0000-000000000005'
      AND owner_id IS NULL
      AND owner_name = 'Departing Mentor'
  )
  AND EXISTS (
    SELECT 1
    FROM public.bulletin_items
    WHERE id = '10000000-0000-0000-0000-000000000006'
      AND created_by IS NULL
      AND created_by_name = 'Departing Mentor'
  ),
  '51 account deletion preserves owner and creator display snapshots'
);

SELECT * FROM finish();
ROLLBACK;
