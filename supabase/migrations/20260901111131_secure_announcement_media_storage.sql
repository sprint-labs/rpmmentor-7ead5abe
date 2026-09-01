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
      CHECK (ends_at IS NULL OR ends_at > starts_at) NOT VALID;
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

DROP POLICY IF EXISTS gk_media_read ON storage.objects;
DROP POLICY IF EXISTS gk_media_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS gk_media_select_scoped ON storage.objects;

CREATE POLICY gk_media_select_scoped
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'gk-media'
  AND (
    (
      (storage.foldername(name))[1] = 'announcements'
      AND (
        public.has_role((select auth.uid()), 'super_admin'::public.app_role)
        OR EXISTS (
          SELECT 1
          FROM public.announcements AS announcement
          WHERE announcement.attachment_path = storage.objects.name
            AND announcement.active = true
            AND announcement.starts_at <= now()
            AND (announcement.ends_at IS NULL OR announcement.ends_at > now())
        )
      )
    )
    OR (
      (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
      AND (
        (select auth.uid()) = owner
        OR public.has_role((select auth.uid()), 'mentor'::public.app_role)
        OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
        OR public.has_role((select auth.uid()), 'admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
      )
    )
  )
);

DROP POLICY IF EXISTS gk_media_insert_authenticated ON storage.objects;

CREATE POLICY gk_media_insert_authenticated
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gk-media'
  AND (
    (
      (storage.foldername(name))[1] = 'announcements'
      AND public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    )
    OR (
      (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
      AND (select auth.uid()) IS NOT NULL
    )
  )
);

DROP POLICY IF EXISTS gk_media_update_authenticated ON storage.objects;
DROP POLICY IF EXISTS gk_media_update_privileged ON storage.objects;

CREATE POLICY gk_media_update_privileged
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'gk-media'
  AND (
    (
      (storage.foldername(name))[1] = 'announcements'
      AND public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    )
    OR (
      (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
      AND (
        (select auth.uid()) = owner
        OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
        OR public.has_role((select auth.uid()), 'admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'gk-media'
  AND (
    (
      (storage.foldername(name))[1] = 'announcements'
      AND public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    )
    OR (
      (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
      AND (
        (select auth.uid()) = owner
        OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
        OR public.has_role((select auth.uid()), 'admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
      )
    )
  )
);

DROP POLICY IF EXISTS gk_media_delete_privileged ON storage.objects;

CREATE POLICY gk_media_delete_privileged
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'gk-media'
  AND (
    (
      (storage.foldername(name))[1] = 'announcements'
      AND public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    )
    OR (
      (storage.foldername(name))[1] IS DISTINCT FROM 'announcements'
      AND (
        (select auth.uid()) = owner
        OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
        OR public.has_role((select auth.uid()), 'admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
      )
    )
  )
);

-- This marker is deliberately created after every hardening statement. The
-- application fails closed when the RPC is absent, so an application deploy
-- cannot upload Broadcast media while the legacy broad policies are still in
-- place. The attachment schema migration is a prerequisite because the policy
-- definitions above reference its columns. The v1 suffix binds callers to this
-- policy contract; a future incompatible policy contract must use a new marker.
CREATE OR REPLACE FUNCTION public.announcement_media_storage_ready_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.announcement_media_storage_ready_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.announcement_media_storage_ready_v1() TO authenticated;
