
DROP POLICY IF EXISTS match_reports_cache_select_auth ON public.match_reports_cache;
CREATE POLICY match_reports_cache_select_privileged
  ON public.match_reports_cache FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'mentor'::app_role)
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS media_audit_insert_authenticated ON public.media_audit_log;
CREATE POLICY media_audit_insert_own_actor
  ON public.media_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid()::text);

DROP POLICY IF EXISTS gk_media_update_authenticated ON storage.objects;
CREATE POLICY gk_media_update_privileged
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'gk-media'
    AND (
      auth.uid() = owner
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'gk-media'
    AND (
      auth.uid() = owner
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
