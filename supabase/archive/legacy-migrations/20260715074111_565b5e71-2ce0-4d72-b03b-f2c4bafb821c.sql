
-- =========================================================================
-- 1. media_assets: scope SELECT/INSERT/UPDATE to owner or privileged roles
-- =========================================================================
DROP POLICY IF EXISTS media_assets_select_authenticated ON public.media_assets;
DROP POLICY IF EXISTS media_assets_insert_authenticated ON public.media_assets;
DROP POLICY IF EXISTS media_assets_update_authenticated ON public.media_assets;

CREATE POLICY media_assets_select_scoped
ON public.media_assets
FOR SELECT
TO authenticated
USING (
  uploaded_by_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'mentor'::app_role)
  OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY media_assets_insert_scoped
ON public.media_assets
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by_id = (auth.uid())::text
  AND (
    public.has_role(auth.uid(), 'mentor'::app_role)
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY media_assets_update_scoped
ON public.media_assets
FOR UPDATE
TO authenticated
USING (
  uploaded_by_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  uploaded_by_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- =========================================================================
-- 2. report_attachments: scope to users with a role; ownership on write
-- =========================================================================
DROP POLICY IF EXISTS report_attachments_select_authenticated ON public.report_attachments;
DROP POLICY IF EXISTS report_attachments_insert_authenticated ON public.report_attachments;
DROP POLICY IF EXISTS report_attachments_delete_authenticated ON public.report_attachments;

CREATE POLICY report_attachments_select_scoped
ON public.report_attachments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor'::app_role)
  OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY report_attachments_insert_scoped
ON public.report_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  attached_by_id = (auth.uid())::text
  AND (
    public.has_role(auth.uid(), 'mentor'::app_role)
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY report_attachments_delete_scoped
ON public.report_attachments
FOR DELETE
TO authenticated
USING (
  attached_by_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- =========================================================================
-- 3. gk-media storage bucket: restrict SELECT to owner or privileged roles
-- =========================================================================
DROP POLICY IF EXISTS gk_media_select_authenticated ON storage.objects;

CREATE POLICY gk_media_select_scoped
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'gk-media'::text
  AND (
    auth.uid() = owner
    OR public.has_role(auth.uid(), 'mentor'::app_role)
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- =========================================================================
-- 4. has_role SECURITY DEFINER: revoke direct EXECUTE from signed-in users
-- Policies still evaluate the function via the postgres role.
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
