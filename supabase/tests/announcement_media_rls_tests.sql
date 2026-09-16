-- Broadcast announcement and dedicated media-bucket RLS contract.
--
-- Run only against a disposable local Supabase database after migrations:
--   supabase test db supabase/tests/announcement_media_rls_tests.sql
--
-- Every fixture is transaction-scoped and rolled back. Never run with --linked.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(27);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.announcements'::regclass),
  '1 announcements has RLS enabled'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass),
  '2 storage.objects has RLS enabled'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcements'
      AND policyname = 'announcements_select_scoped'
      AND cmd = 'SELECT'
  ),
  '3 scoped announcement SELECT policy exists'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'gk_broadcast_media_select_scoped'
      AND cmd = 'SELECT'
  ),
  '4 scoped Broadcast-media SELECT policy exists'
);

-- Auth users are created as postgres so the handle_new_user trigger supplies
-- their profiles. The roleless user deliberately receives no user_roles row.
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
    '90000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'broadcast-roleless@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Broadcast Roleless","initials":"BR"}'::jsonb,
    now(),
    now()
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'broadcast-mentor@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Broadcast Mentor","initials":"BM"}'::jsonb,
    now(),
    now()
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'broadcast-manager@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Broadcast Manager","initials":"BG"}'::jsonb,
    now(),
    now()
  ),
  (
    '90000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'broadcast-admin@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Broadcast Admin","initials":"BA"}'::jsonb,
    now(),
    now()
  ),
  (
    '90000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'broadcast-super-admin@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Broadcast Super Admin","initials":"BS"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('90000000-0000-0000-0000-000000000002', 'mentor'),
  ('90000000-0000-0000-0000-000000000003', 'mentor_manager'),
  ('90000000-0000-0000-0000-000000000004', 'admin'),
  ('90000000-0000-0000-0000-000000000005', 'super_admin');

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.user_roles
    WHERE user_id = '90000000-0000-0000-0000-000000000001'
  ),
  0,
  '5 roleless fixture has no application role'
);

INSERT INTO public.announcements (
  id,
  kind,
  title,
  body,
  starts_at,
  ends_at,
  active,
  created_by,
  attachment_path,
  attachment_name,
  attachment_mime,
  attachment_size
)
VALUES
  (
    '91000000-0000-0000-0000-000000000001',
    'info',
    'Live Broadcast',
    '',
    now() - interval '1 minute',
    now() + interval '1 hour',
    true,
    '90000000-0000-0000-0000-000000000005',
    'announcements/pgtap/live.pdf',
    'live.pdf',
    'application/pdf',
    4
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    'info',
    'Scheduled Broadcast',
    '',
    now() + interval '1 hour',
    now() + interval '2 hours',
    true,
    '90000000-0000-0000-0000-000000000005',
    'announcements/pgtap/scheduled.pdf',
    'scheduled.pdf',
    'application/pdf',
    9
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    'info',
    'Expired Broadcast',
    '',
    now() - interval '2 hours',
    now() - interval '1 hour',
    true,
    '90000000-0000-0000-0000-000000000005',
    'announcements/pgtap/expired.pdf',
    'expired.pdf',
    'application/pdf',
    7
  ),
  (
    '91000000-0000-0000-0000-000000000004',
    'info',
    'Inactive Broadcast',
    '',
    now() - interval '1 minute',
    now() + interval '1 hour',
    false,
    '90000000-0000-0000-0000-000000000005',
    'announcements/pgtap/inactive.pdf',
    'inactive.pdf',
    'application/pdf',
    8
  );

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES
  (
    'gk-broadcast-media',
    'announcements/pgtap/live.pdf',
    '90000000-0000-0000-0000-000000000005',
    '{"mimetype":"application/pdf"}'::jsonb
  ),
  (
    'gk-broadcast-media',
    'announcements/pgtap/scheduled.pdf',
    '90000000-0000-0000-0000-000000000005',
    '{"mimetype":"application/pdf"}'::jsonb
  ),
  (
    'gk-broadcast-media',
    'announcements/pgtap/expired.pdf',
    '90000000-0000-0000-0000-000000000005',
    '{"mimetype":"application/pdf"}'::jsonb
  ),
  (
    'gk-broadcast-media',
    'announcements/pgtap/inactive.pdf',
    '90000000-0000-0000-0000-000000000005',
    '{"mimetype":"application/pdf"}'::jsonb
  ),
  (
    'gk-broadcast-media',
    'announcements/pgtap/unlinked.pdf',
    '90000000-0000-0000-0000-000000000005',
    '{"mimetype":"application/pdf"}'::jsonb
  );

-- A valid Auth JWT without a current application role sees neither boundary.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.announcements),
  0,
  '6 roleless JWT cannot read a live announcement'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM storage.objects
    WHERE bucket_id = 'gk-broadcast-media'
      AND (storage.foldername(name))[1] = 'announcements'
  ),
  0,
  '7 roleless JWT cannot read linked live media'
);

-- Every operational non-Super-Admin role sees only the live linked pair.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT string_agg(id::text, ',' ORDER BY id) FROM public.announcements),
  '91000000-0000-0000-0000-000000000001',
  '8 Mentor sees only the live announcement'
);

SELECT is(
  (
    SELECT string_agg(name, ',' ORDER BY name)
    FROM storage.objects
    WHERE bucket_id = 'gk-broadcast-media'
      AND (storage.foldername(name))[1] = 'announcements'
  ),
  'announcements/pgtap/live.pdf',
  '9 Mentor sees only the linked live object'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT string_agg(id::text, ',' ORDER BY id) FROM public.announcements),
  '91000000-0000-0000-0000-000000000001',
  '10 Mentor Manager sees only the live announcement'
);

SELECT is(
  (
    SELECT string_agg(name, ',' ORDER BY name)
    FROM storage.objects
    WHERE bucket_id = 'gk-broadcast-media'
      AND (storage.foldername(name))[1] = 'announcements'
  ),
  'announcements/pgtap/live.pdf',
  '11 Mentor Manager sees only the linked live object'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT string_agg(id::text, ',' ORDER BY id) FROM public.announcements),
  '91000000-0000-0000-0000-000000000001',
  '12 Admin sees only the live announcement'
);

SELECT is(
  (
    SELECT string_agg(name, ',' ORDER BY name)
    FROM storage.objects
    WHERE bucket_id = 'gk-broadcast-media'
      AND (storage.foldername(name))[1] = 'announcements'
  ),
  'announcements/pgtap/live.pdf',
  '13 Admin sees only the linked live object'
);

-- Super Admin can manage scheduled, expired and inactive rows plus unlinked objects.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.announcements),
  4,
  '14 Super Admin sees live, scheduled, expired and inactive announcements'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM storage.objects
    WHERE bucket_id = 'gk-broadcast-media'
      AND (storage.foldername(name))[1] = 'announcements'
  ),
  5,
  '15 Super Admin sees every reserved object'
);

-- Only Storage's size-checked standard/TUS routes may authorise an INSERT.
-- A direct PostgREST write carries no storage.operation and a cross-bucket
-- copy carries storage.object.copy, so both fail before they can bypass the
-- dedicated bucket's byte and MIME limits.
SELECT set_config('storage.operation', '', true);
SELECT throws_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'gk-broadcast-media',
      'announcements/pgtap/direct-rest.pdf',
      '90000000-0000-0000-0000-000000000005',
      '{"mimetype":"application/pdf","contentLength":1,"size":26214401}'::jsonb
    )
  $$,
  '42501',
  NULL,
  '16 direct PostgREST insert cannot bypass Storage limits'
);

SELECT set_config('storage.operation', 'storage.object.copy', true);
SELECT throws_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'gk-broadcast-media',
      'announcements/pgtap/copied.pdf',
      '90000000-0000-0000-0000-000000000005',
      '{"mimetype":"application/pdf","contentLength":1,"size":26214401}'::jsonb
    )
  $$,
  '42501',
  NULL,
  '17 Storage copy cannot bypass the destination bucket cap'
);

SELECT set_config('storage.operation', 'storage.object.upload', true);
SELECT throws_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'gk-broadcast-media',
      'announcements/pgtap/unknown-length.pdf',
      '90000000-0000-0000-0000-000000000005',
      '{"mimetype":"application/pdf"}'::jsonb
    )
  $$,
  '42501',
  NULL,
  '18 standard upload without a known length fails closed'
);

SELECT throws_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'gk-broadcast-media',
      'announcements/pgtap/disallowed.txt',
      '90000000-0000-0000-0000-000000000005',
      '{"mimetype":"text/plain","contentLength":1}'::jsonb
    )
  $$,
  '42501',
  NULL,
  '19 standard upload with a disallowed MIME type fails closed'
);

SELECT lives_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'gk-broadcast-media',
      'announcements/pgtap/standard-upload.pdf',
      '90000000-0000-0000-0000-000000000005',
      '{"mimetype":"application/pdf","contentLength":1}'::jsonb
    )
  $$,
  '20 Storage standard upload may create an unlinked object'
);

SELECT set_config('storage.operation', 'storage.tus.upload.create', true);
SELECT lives_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'gk-broadcast-media',
      'announcements/pgtap/tus-upload.pdf',
      '90000000-0000-0000-0000-000000000005',
      '{"mimetype":"application/pdf","contentLength":26214400}'::jsonb
    )
  $$,
  '21 Storage TUS upload may create an unlinked object'
);

SELECT set_config('storage.operation', '', true);

SELECT is(
  (
    WITH changed AS (
      UPDATE storage.objects
      SET metadata = '{"mimetype":"application/pdf","test":"replacement"}'::jsonb
      WHERE bucket_id = 'gk-broadcast-media'
        AND name = 'announcements/pgtap/live.pdf'
      RETURNING 1
    )
    SELECT count(*)::integer FROM changed
  ),
  0,
  '22 Super Admin cannot replace a linked announcement object'
);

SELECT is(
  (
    WITH removed AS (
      DELETE FROM storage.objects
      WHERE bucket_id = 'gk-broadcast-media'
        AND name = 'announcements/pgtap/live.pdf'
      RETURNING 1
    )
    SELECT count(*)::integer FROM removed
  ),
  0,
  '23 Super Admin cannot delete a linked announcement object'
);

SELECT is(
  (
    WITH changed AS (
      UPDATE storage.objects
      SET metadata = '{"mimetype":"application/pdf","test":"cleanup"}'::jsonb
      WHERE bucket_id = 'gk-broadcast-media'
        AND name = 'announcements/pgtap/unlinked.pdf'
      RETURNING 1
    )
    SELECT count(*)::integer FROM changed
  ),
  0,
  '24 Super Admin cannot replace even an unlinked Broadcast object'
);

SELECT is(
  (
    WITH removed AS (
      DELETE FROM storage.objects
      WHERE bucket_id = 'gk-broadcast-media'
        AND name = 'announcements/pgtap/unlinked.pdf'
      RETURNING 1
    )
    SELECT count(*)::integer FROM removed
  ),
  1,
  '25 Super Admin can clean up an unlinked announcement object'
);

SELECT lives_ok(
  $$
    INSERT INTO public.announcements (
      id,
      kind,
      title,
      body,
      starts_at,
      ends_at,
      active,
      created_by
    )
    VALUES (
      '91000000-0000-0000-0000-000000000005',
      'info',
      'Cancelled scheduled Broadcast',
      '',
      now() + interval '1 hour',
      now(),
      false,
      '90000000-0000-0000-0000-000000000005'
    )
  $$,
  '26 inactive scheduled cancellation may end before its planned start'
);

SELECT throws_ok(
  $$
    INSERT INTO public.announcements (
      id,
      kind,
      title,
      body,
      starts_at,
      ends_at,
      active,
      created_by
    )
    VALUES (
      '91000000-0000-0000-0000-000000000006',
      'info',
      'Invalid active Broadcast',
      '',
      now() + interval '1 hour',
      now(),
      true,
      '90000000-0000-0000-0000-000000000005'
    )
  $$,
  '23514',
  NULL,
  '27 active scheduled Broadcast still requires its end after its start'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
