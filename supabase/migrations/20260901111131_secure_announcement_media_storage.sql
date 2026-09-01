-- Keep Broadcast attachments private until their linked announcement is live.
-- The shared gk-media policies must be replaced rather than supplemented:
-- permissive PostgreSQL policies combine with OR, so an older broad policy
-- would otherwise continue to grant access.

DO $$
BEGIN
  -- Do not let historical rows abort the storage-policy cutover. NOT VALID
  -- still enforces each check for every new or updated row; validation remains
  -- a deliberate follow-up after a read-only legacy-row preflight.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_window_check'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_window_check
      CHECK (NOT active OR ends_at IS NULL OR ends_at > starts_at) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_attachment_mime_check'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_attachment_mime_check
      CHECK (
        attachment_mime IS NULL
        OR attachment_mime IN (
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'video/mp4',
          'video/quicktime',
          'video/webm',
          'audio/mpeg',
          'audio/mp4',
          'audio/wav',
          'audio/webm',
          'audio/x-m4a',
          'audio/aac',
          'application/pdf'
        )
      ) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS announcements_attachment_path_idx
  ON public.announcements (attachment_path)
  WHERE attachment_path IS NOT NULL;

-- A valid Auth session is not application access on its own. Recreate the
-- announcement read policy so removing every user_roles row immediately
-- revokes the feed and any new Storage authorization, even while a JWT is
-- still valid. An already issued signed URL ages out within the application's
-- five-minute lifetime. Super Admin retains scheduled and ended access.
DROP POLICY IF EXISTS announcements_select_scoped ON public.announcements;

CREATE POLICY announcements_select_scoped
ON public.announcements
FOR SELECT
TO authenticated
USING (
  public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  OR (
    (
      public.has_role((select auth.uid()), 'mentor'::public.app_role)
      OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
      OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    )
    AND active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  )
);

-- Broadcast files use a dedicated bucket because the shared gk-media bucket
-- intentionally supports uploads much larger than the Broadcast 25 MiB cap.
-- Storage enforces these limits before accepting bytes, including when a
-- privileged caller bypasses the application handler and uses the API directly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gk-broadcast-media',
  'gk-broadcast-media',
  false,
  26214400,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/aac',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Retire the former reserved prefix in the shared bucket. Recreate, rather
-- than supplement, each permissive policy because permissive RLS policies are
-- combined with OR. All established behaviour outside announcements/* stays
-- unchanged.
DROP POLICY IF EXISTS gk_media_read ON storage.objects;
DROP POLICY IF EXISTS gk_media_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS gk_media_select_scoped ON storage.objects;

CREATE POLICY gk_media_select_scoped
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'gk-media'
  AND (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
  AND (
    (select auth.uid()) = owner
    OR public.has_role((select auth.uid()), 'mentor'::public.app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS gk_media_insert_authenticated ON storage.objects;

CREATE POLICY gk_media_insert_authenticated
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gk-media'
  AND (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
  AND (select auth.uid()) IS NOT NULL
);

DROP POLICY IF EXISTS gk_media_update_authenticated ON storage.objects;
DROP POLICY IF EXISTS gk_media_update_privileged ON storage.objects;

CREATE POLICY gk_media_update_privileged
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'gk-media'
  AND (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
  AND (
    (select auth.uid()) = owner
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'gk-media'
  AND (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
  AND (
    (select auth.uid()) = owner
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS gk_media_delete_privileged ON storage.objects;

CREATE POLICY gk_media_delete_privileged
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'gk-media'
  AND (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
  AND (
    (select auth.uid()) = owner
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
);

-- The dedicated private bucket is immutable through authenticated APIs: new
-- objects use INSERT with upsert disabled, and there is deliberately no UPDATE
-- policy. Super Admins may clean up abandoned uploads only until an
-- announcement row links the path.
DROP POLICY IF EXISTS gk_broadcast_media_select_scoped ON storage.objects;

CREATE POLICY gk_broadcast_media_select_scoped
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'gk-broadcast-media'
  AND (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    OR (
      (
        public.has_role((select auth.uid()), 'mentor'::public.app_role)
        OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
        OR public.has_role((select auth.uid()), 'admin'::public.app_role)
      )
      AND EXISTS (
        SELECT 1
        FROM public.announcements AS announcement
        WHERE announcement.attachment_path = storage.objects.name
          AND announcement.active = true
          AND announcement.starts_at <= now()
          AND (announcement.ends_at IS NULL OR announcement.ends_at > now())
      )
    )
  )
);

DROP POLICY IF EXISTS gk_broadcast_media_insert_super_admin ON storage.objects;

CREATE POLICY gk_broadcast_media_insert_super_admin
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gk-broadcast-media'
  AND public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  -- Keep the bucket limit as the trusted byte boundary. Copy and move do not
  -- re-apply a destination bucket's size/MIME configuration, and direct
  -- PostgREST writes do not carry a Storage operation. Admit only the two
  -- browser upload transports used by this application; every other route
  -- (including copy, move, signed upload and S3) fails closed.
  AND storage.allow_any_operation(ARRAY[
    'storage.object.upload',
    'storage.tus.upload.create',
    'storage.tus.upload.part'
  ]::text[])
  -- Standard uploads derive this from HTTP Content-Length and TUS derives it
  -- from Upload-Length. Reject unknown-length/chunked bodies so every admitted
  -- route has a service-enforced, non-spoofable bound before bytes are stored.
  AND CASE
    WHEN jsonb_typeof(metadata -> 'contentLength') = 'number'
      THEN (metadata ->> 'contentLength')::numeric BETWEEN 0 AND 26214400
    ELSE false
  END
  AND (metadata ->> 'mimetype') IN (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/aac',
    'application/pdf'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.announcements AS linked_announcement
    WHERE linked_announcement.attachment_path = storage.objects.name
  )
);

DROP POLICY IF EXISTS gk_broadcast_media_update_super_admin ON storage.objects;

DROP POLICY IF EXISTS gk_broadcast_media_delete_super_admin ON storage.objects;

CREATE POLICY gk_broadcast_media_delete_super_admin
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'gk-broadcast-media'
  AND public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  AND NOT EXISTS (
    SELECT 1
    FROM public.announcements AS linked_announcement
    WHERE linked_announcement.attachment_path = storage.objects.name
  )
);

-- This marker is deliberately created after every hardening statement. The
-- application fails closed when the RPC is absent, so an application deploy
-- cannot upload Broadcast media while the legacy broad policies are still in
-- place. The attachment schema migration is a prerequisite because the policy
-- definitions above reference its columns. Retire v1 so an older app fails
-- closed during a DB-first rollout; v2 binds callers to the dedicated capped
-- bucket contract.
DROP FUNCTION IF EXISTS public.announcement_media_storage_ready_v1();

CREATE OR REPLACE FUNCTION public.announcement_media_storage_ready_v2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.announcement_media_storage_ready_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.announcement_media_storage_ready_v2() TO authenticated;
