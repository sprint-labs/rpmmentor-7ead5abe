BEGIN;
-- public.announcement_reads
ALTER TABLE ONLY public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- public.announcements
ALTER TABLE ONLY public.announcements ENABLE ROW LEVEL SECURITY;

-- public.calendar_event_audit
ALTER TABLE ONLY public.calendar_event_audit ENABLE ROW LEVEL SECURITY;

-- public.calendar_events
ALTER TABLE ONLY public.calendar_events ENABLE ROW LEVEL SECURITY;

-- public.dashboard_click_events
ALTER TABLE ONLY public.dashboard_click_events ENABLE ROW LEVEL SECURITY;

-- public.install_prompt_events
ALTER TABLE ONLY public.install_prompt_events ENABLE ROW LEVEL SECURITY;

-- public.interaction_audit
ALTER TABLE ONLY public.interaction_audit ENABLE ROW LEVEL SECURITY;

-- public.interaction_media
ALTER TABLE ONLY public.interaction_media ENABLE ROW LEVEL SECURITY;

-- public.interaction_types
ALTER TABLE ONLY public.interaction_types ENABLE ROW LEVEL SECURITY;

-- public.interactions
ALTER TABLE ONLY public.interactions ENABLE ROW LEVEL SECURITY;

-- public.match_report_cutover_state
ALTER TABLE ONLY public.match_report_cutover_state ENABLE ROW LEVEL SECURITY;

-- public.match_report_submissions
ALTER TABLE ONLY public.match_report_submissions ENABLE ROW LEVEL SECURITY;

-- public.match_reports_cache
ALTER TABLE ONLY public.match_reports_cache ENABLE ROW LEVEL SECURITY;

-- public.media_assets
ALTER TABLE ONLY public.media_assets ENABLE ROW LEVEL SECURITY;

-- public.media_audit_log
ALTER TABLE ONLY public.media_audit_log ENABLE ROW LEVEL SECURITY;

-- public.notifications
ALTER TABLE ONLY public.notifications ENABLE ROW LEVEL SECURITY;

-- public.password_change_audit
ALTER TABLE ONLY public.password_change_audit ENABLE ROW LEVEL SECURITY;

-- public.players
ALTER TABLE ONLY public.players ENABLE ROW LEVEL SECURITY;

-- public.profiles
ALTER TABLE ONLY public.profiles ENABLE ROW LEVEL SECURITY;

-- public.purged_demo_records
ALTER TABLE ONLY public.purged_demo_records ENABLE ROW LEVEL SECURITY;

-- public.report_attachments
ALTER TABLE ONLY public.report_attachments ENABLE ROW LEVEL SECURITY;

-- public.support_messages
ALTER TABLE ONLY public.support_messages ENABLE ROW LEVEL SECURITY;

-- public.support_threads
ALTER TABLE ONLY public.support_threads ENABLE ROW LEVEL SECURITY;

-- public.user_deletion_audit
ALTER TABLE ONLY public.user_deletion_audit ENABLE ROW LEVEL SECURITY;

-- public.user_roles
ALTER TABLE ONLY public.user_roles ENABLE ROW LEVEL SECURITY;

-- public.announcement_reads.announcement_reads_insert_own
CREATE POLICY announcement_reads_insert_own ON public.announcement_reads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_id = (( SELECT auth.uid() AS uid)));

-- public.announcement_reads.announcement_reads_no_client_delete
CREATE POLICY announcement_reads_no_client_delete ON public.announcement_reads AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.announcement_reads.announcement_reads_no_client_update
CREATE POLICY announcement_reads_no_client_update ON public.announcement_reads AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- public.announcement_reads.announcement_reads_select_own
CREATE POLICY announcement_reads_select_own ON public.announcement_reads AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = (( SELECT auth.uid() AS uid)));

-- public.announcements.announcements_delete_super_admin
CREATE POLICY announcements_delete_super_admin ON public.announcements AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.announcements.announcements_insert_super_admin
CREATE POLICY announcements_insert_super_admin ON public.announcements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.announcements.announcements_select_scoped
CREATE POLICY announcements_select_scoped ON public.announcements AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

-- public.announcements.announcements_update_super_admin
CREATE POLICY announcements_update_super_admin ON public.announcements AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.calendar_event_audit.calendar_event_audit_no_client_delete
CREATE POLICY calendar_event_audit_no_client_delete ON public.calendar_event_audit AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.calendar_event_audit.calendar_event_audit_no_client_insert
CREATE POLICY calendar_event_audit_no_client_insert ON public.calendar_event_audit AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- public.calendar_event_audit.calendar_event_audit_no_client_update
CREATE POLICY calendar_event_audit_no_client_update ON public.calendar_event_audit AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- public.calendar_event_audit.calendar_event_audit_select_scoped
CREATE POLICY calendar_event_audit_select_scoped ON public.calendar_event_audit AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM calendar_events e
  WHERE e.id = calendar_event_audit.calendar_event_id AND e.assigned_mentor_id = (( SELECT auth.uid() AS uid)))));

-- public.calendar_events.calendar_events_delete_managers
CREATE POLICY calendar_events_delete_managers ON public.calendar_events AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.calendar_events.calendar_events_insert_managers
CREATE POLICY calendar_events_insert_managers ON public.calendar_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (created_by = (( SELECT auth.uid() AS uid)) AND (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));

-- public.calendar_events.calendar_events_select_authorised
CREATE POLICY calendar_events_select_authorised ON public.calendar_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.calendar_events.calendar_events_update_managers
CREATE POLICY calendar_events_update_managers ON public.calendar_events AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.dashboard_click_events."Users can insert their own click events"
CREATE POLICY "Users can insert their own click events" ON public.dashboard_click_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid)) = user_id);

-- public.dashboard_click_events."Users can view their own click events"
CREATE POLICY "Users can view their own click events" ON public.dashboard_click_events AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid)) = user_id OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.install_prompt_events."Users can insert their own install events"
CREATE POLICY "Users can insert their own install events" ON public.install_prompt_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR (( SELECT auth.uid() AS uid)) = user_id);

-- public.install_prompt_events."Users can view their own install events"
CREATE POLICY "Users can view their own install events" ON public.install_prompt_events AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid)) = user_id OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.interaction_audit.interaction_audit_no_client_delete
CREATE POLICY interaction_audit_no_client_delete ON public.interaction_audit AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.interaction_audit.interaction_audit_no_client_insert
CREATE POLICY interaction_audit_no_client_insert ON public.interaction_audit AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- public.interaction_audit.interaction_audit_no_client_update
CREATE POLICY interaction_audit_no_client_update ON public.interaction_audit AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- public.interaction_audit.interaction_audit_select_scoped
CREATE POLICY interaction_audit_select_scoped ON public.interaction_audit AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM interactions i
  WHERE i.id = interaction_audit.interaction_id AND i.mentor_id = (( SELECT auth.uid() AS uid)))));

-- public.interaction_media.interaction_media_insert_authorised
CREATE POLICY interaction_media_insert_authorised ON public.interaction_media AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (attached_by = (( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM interactions i
  WHERE i.id = interaction_media.interaction_id AND i.deleted_at IS NULL AND (i.mentor_id = (( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)))) AND (EXISTS ( SELECT 1
   FROM media_assets m
  WHERE m.id = interaction_media.media_id)));

-- public.interaction_media.interaction_media_no_client_delete
CREATE POLICY interaction_media_no_client_delete ON public.interaction_media AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.interaction_media.interaction_media_no_client_update
CREATE POLICY interaction_media_no_client_update ON public.interaction_media AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- public.interaction_media.interaction_media_select_scoped
CREATE POLICY interaction_media_select_scoped ON public.interaction_media AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM interactions i
  WHERE i.id = interaction_media.interaction_id AND i.deleted_at IS NULL)));

-- public.interaction_types."Authenticated can read interaction types"
CREATE POLICY "Authenticated can read interaction types" ON public.interaction_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- public.interaction_types."Super admins manage interaction types"
CREATE POLICY "Super admins manage interaction types" ON public.interaction_types AS PERMISSIVE FOR ALL TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.interactions.interactions_insert_own
CREATE POLICY interactions_insert_own ON public.interactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (mentor_id = (( SELECT auth.uid() AS uid)) AND (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));

-- public.interactions.interactions_select_privileged
CREATE POLICY interactions_select_privileged ON public.interactions AS PERMISSIVE FOR SELECT TO authenticated USING (deleted_at IS NULL AND (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.interactions.interactions_update_authorised
CREATE POLICY interactions_update_authorised ON public.interactions AS PERMISSIVE FOR UPDATE TO authenticated USING (mentor_id = (( SELECT auth.uid() AS uid)) AND (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (mentor_id = (( SELECT auth.uid() AS uid)) AND (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.match_report_cutover_state.match_report_cutover_state_read
CREATE POLICY match_report_cutover_state_read ON public.match_report_cutover_state AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- public.match_report_submissions.match_report_submissions_insert_own
CREATE POLICY match_report_submissions_insert_own ON public.match_report_submissions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid)) = user_id);

-- public.match_report_submissions.match_report_submissions_select_scoped
CREATE POLICY match_report_submissions_select_scoped ON public.match_report_submissions AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid)) = user_id OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.match_reports_cache.match_reports_cache_select_privileged
CREATE POLICY match_reports_cache_select_privileged ON public.match_reports_cache AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.media_assets.media_assets_delete_privileged
CREATE POLICY media_assets_delete_privileged ON public.media_assets AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role));

-- public.media_assets.media_assets_insert_scoped
CREATE POLICY media_assets_insert_scoped ON public.media_assets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (uploaded_by_id = ((( SELECT auth.uid() AS uid))::text) AND (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));

-- public.media_assets.media_assets_select_scoped
CREATE POLICY media_assets_select_scoped ON public.media_assets AS PERMISSIVE FOR SELECT TO authenticated USING (uploaded_by_id = ((( SELECT auth.uid() AS uid))::text) OR has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.media_assets.media_assets_update_scoped
CREATE POLICY media_assets_update_scoped ON public.media_assets AS PERMISSIVE FOR UPDATE TO authenticated USING (uploaded_by_id = ((( SELECT auth.uid() AS uid))::text) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (uploaded_by_id = ((( SELECT auth.uid() AS uid))::text) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.media_audit_log.media_audit_insert_own_actor
CREATE POLICY media_audit_insert_own_actor ON public.media_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (actor_id = ((( SELECT auth.uid() AS uid))::text));

-- public.media_audit_log.media_audit_select_privileged
CREATE POLICY media_audit_select_privileged ON public.media_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role));

-- public.notifications.notifications_insert_authorised
CREATE POLICY notifications_insert_authorised ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (recipient_id = (( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.notifications.notifications_no_client_delete
CREATE POLICY notifications_no_client_delete ON public.notifications AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.notifications.notifications_select_own
CREATE POLICY notifications_select_own ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING (recipient_id = (( SELECT auth.uid() AS uid)));

-- public.notifications.notifications_update_own
CREATE POLICY notifications_update_own ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (recipient_id = (( SELECT auth.uid() AS uid))) WITH CHECK (recipient_id = (( SELECT auth.uid() AS uid)));

-- public.password_change_audit."Super admins can view password audit"
CREATE POLICY "Super admins can view password audit" ON public.password_change_audit AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.players."Authenticated can read players"
CREATE POLICY "Authenticated can read players" ON public.players AS PERMISSIVE FOR SELECT TO authenticated USING (deleted_at IS NULL OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.players."Super admins manage players"
CREATE POLICY "Super admins manage players" ON public.players AS PERMISSIVE FOR ALL TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.players.players_update_club_authorised
CREATE POLICY players_update_club_authorised ON public.players AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.profiles.profiles_no_client_delete
CREATE POLICY profiles_no_client_delete ON public.profiles AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.profiles.profiles_no_client_insert
CREATE POLICY profiles_no_client_insert ON public.profiles AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- public.profiles.profiles_select_own_or_privileged
CREATE POLICY profiles_select_own_or_privileged ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid)) = id OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role));

-- public.profiles.profiles_update_own
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid)) = id) WITH CHECK ((( SELECT auth.uid() AS uid)) = id);

-- public.purged_demo_records.purged_demo_records_no_client_delete
CREATE POLICY purged_demo_records_no_client_delete ON public.purged_demo_records AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.purged_demo_records.purged_demo_records_no_client_insert
CREATE POLICY purged_demo_records_no_client_insert ON public.purged_demo_records AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- public.purged_demo_records.purged_demo_records_no_client_update
CREATE POLICY purged_demo_records_no_client_update ON public.purged_demo_records AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- public.purged_demo_records.purged_demo_records_select_super_admin
CREATE POLICY purged_demo_records_select_super_admin ON public.purged_demo_records AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.report_attachments.report_attachments_delete_scoped
CREATE POLICY report_attachments_delete_scoped ON public.report_attachments AS PERMISSIVE FOR DELETE TO authenticated USING (attached_by_id = ((( SELECT auth.uid() AS uid))::text) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.report_attachments.report_attachments_insert_scoped
CREATE POLICY report_attachments_insert_scoped ON public.report_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (attached_by_id = ((( SELECT auth.uid() AS uid))::text) AND (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)));

-- public.report_attachments.report_attachments_select_scoped
CREATE POLICY report_attachments_select_scoped ON public.report_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'mentor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'mentor_manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.support_messages.support_messages_insert_scoped
CREATE POLICY support_messages_insert_scoped ON public.support_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (author_id = (( SELECT auth.uid() AS uid)) AND (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM support_threads t
  WHERE t.id = support_messages.thread_id AND t.author_id = (( SELECT auth.uid() AS uid))))));

-- public.support_messages.support_messages_no_client_delete
CREATE POLICY support_messages_no_client_delete ON public.support_messages AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.support_messages.support_messages_no_client_update
CREATE POLICY support_messages_no_client_update ON public.support_messages AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- public.support_messages.support_messages_select_scoped
CREATE POLICY support_messages_select_scoped ON public.support_messages AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM support_threads t
  WHERE t.id = support_messages.thread_id AND t.author_id = (( SELECT auth.uid() AS uid)))));

-- public.support_threads.support_threads_delete_own
CREATE POLICY support_threads_delete_own ON public.support_threads AS PERMISSIVE FOR DELETE TO authenticated USING (author_id = (( SELECT auth.uid() AS uid)));

-- public.support_threads.support_threads_insert_own
CREATE POLICY support_threads_insert_own ON public.support_threads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (author_id = (( SELECT auth.uid() AS uid)));

-- public.support_threads.support_threads_no_anon_delete
CREATE POLICY support_threads_no_anon_delete ON public.support_threads AS PERMISSIVE FOR DELETE TO anon USING (false);

-- public.support_threads.support_threads_select_scoped
CREATE POLICY support_threads_select_scoped ON public.support_threads AS PERMISSIVE FOR SELECT TO authenticated USING (author_id = (( SELECT auth.uid() AS uid)) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.support_threads.support_threads_update_super_admin
CREATE POLICY support_threads_update_super_admin ON public.support_threads AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)) WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.user_deletion_audit."Super admins can view deletion audit"
CREATE POLICY "Super admins can view deletion audit" ON public.user_deletion_audit AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role));

-- public.user_roles.user_roles_no_client_delete
CREATE POLICY user_roles_no_client_delete ON public.user_roles AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);

-- public.user_roles.user_roles_no_client_insert
CREATE POLICY user_roles_no_client_insert ON public.user_roles AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

-- public.user_roles.user_roles_no_client_update
CREATE POLICY user_roles_no_client_update ON public.user_roles AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

-- public.user_roles.user_roles_select_own
CREATE POLICY user_roles_select_own ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid)) = user_id);
COMMIT;
