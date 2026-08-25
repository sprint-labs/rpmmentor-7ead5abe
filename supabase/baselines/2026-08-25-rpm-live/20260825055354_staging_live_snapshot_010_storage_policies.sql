BEGIN;
-- storage.objects.gk_media_delete_privileged
CREATE POLICY gk_media_delete_privileged ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (bucket_id = 'gk-media'::text AND (auth.uid() = owner OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor_manager'::app_role)));

-- storage.objects.gk_media_insert_authenticated
CREATE POLICY gk_media_insert_authenticated ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gk-media'::text AND auth.uid() IS NOT NULL);

-- storage.objects.gk_media_select_scoped
CREATE POLICY gk_media_select_scoped ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (bucket_id = 'gk-media'::text AND (auth.uid() = owner OR has_role(auth.uid(), 'mentor'::app_role) OR has_role(auth.uid(), 'mentor_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

-- storage.objects.gk_media_update_privileged
CREATE POLICY gk_media_update_privileged ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (bucket_id = 'gk-media'::text AND (auth.uid() = owner OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor_manager'::app_role))) WITH CHECK (bucket_id = 'gk-media'::text AND (auth.uid() = owner OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor_manager'::app_role)));
COMMIT;
