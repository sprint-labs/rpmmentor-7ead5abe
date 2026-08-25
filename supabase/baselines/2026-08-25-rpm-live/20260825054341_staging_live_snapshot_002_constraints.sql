BEGIN;
-- public.announcement_reads.announcement_reads_pkey
ALTER TABLE ONLY public.announcement_reads ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (announcement_id, user_id);

-- public.announcements.announcements_pkey
ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);

-- public.calendar_event_audit.calendar_event_audit_pkey
ALTER TABLE ONLY public.calendar_event_audit ADD CONSTRAINT calendar_event_audit_pkey PRIMARY KEY (id);

-- public.calendar_events.calendar_events_pkey
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);

-- public.dashboard_click_events.dashboard_click_events_pkey
ALTER TABLE ONLY public.dashboard_click_events ADD CONSTRAINT dashboard_click_events_pkey PRIMARY KEY (id);

-- public.install_prompt_events.install_prompt_events_pkey
ALTER TABLE ONLY public.install_prompt_events ADD CONSTRAINT install_prompt_events_pkey PRIMARY KEY (id);

-- public.interaction_audit.interaction_audit_pkey
ALTER TABLE ONLY public.interaction_audit ADD CONSTRAINT interaction_audit_pkey PRIMARY KEY (id);

-- public.interaction_media.interaction_media_pkey
ALTER TABLE ONLY public.interaction_media ADD CONSTRAINT interaction_media_pkey PRIMARY KEY (id);

-- public.interaction_types.interaction_types_pkey
ALTER TABLE ONLY public.interaction_types ADD CONSTRAINT interaction_types_pkey PRIMARY KEY (name);

-- public.interactions.interactions_pkey
ALTER TABLE ONLY public.interactions ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);

-- public.match_report_cutover_state.match_report_cutover_state_pkey
ALTER TABLE ONLY public.match_report_cutover_state ADD CONSTRAINT match_report_cutover_state_pkey PRIMARY KEY (id);

-- public.match_report_submissions.match_report_submissions_pkey
ALTER TABLE ONLY public.match_report_submissions ADD CONSTRAINT match_report_submissions_pkey PRIMARY KEY (id);

-- public.match_reports_cache.match_reports_cache_pkey
ALTER TABLE ONLY public.match_reports_cache ADD CONSTRAINT match_reports_cache_pkey PRIMARY KEY (id);

-- public.media_assets.media_assets_pkey
ALTER TABLE ONLY public.media_assets ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);

-- public.media_audit_log.media_audit_log_pkey
ALTER TABLE ONLY public.media_audit_log ADD CONSTRAINT media_audit_log_pkey PRIMARY KEY (id);

-- public.notifications.notifications_pkey
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

-- public.password_change_audit.password_change_audit_pkey
ALTER TABLE ONLY public.password_change_audit ADD CONSTRAINT password_change_audit_pkey PRIMARY KEY (id);

-- public.players.players_pkey
ALTER TABLE ONLY public.players ADD CONSTRAINT players_pkey PRIMARY KEY (id);

-- public.profiles.profiles_pkey
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

-- public.purged_demo_records.purged_demo_records_pkey
ALTER TABLE ONLY public.purged_demo_records ADD CONSTRAINT purged_demo_records_pkey PRIMARY KEY (id);

-- public.report_attachments.report_attachments_pkey
ALTER TABLE ONLY public.report_attachments ADD CONSTRAINT report_attachments_pkey PRIMARY KEY (id);

-- public.support_messages.support_messages_pkey
ALTER TABLE ONLY public.support_messages ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);

-- public.support_threads.support_threads_pkey
ALTER TABLE ONLY public.support_threads ADD CONSTRAINT support_threads_pkey PRIMARY KEY (id);

-- public.user_deletion_audit.user_deletion_audit_pkey
ALTER TABLE ONLY public.user_deletion_audit ADD CONSTRAINT user_deletion_audit_pkey PRIMARY KEY (id);

-- public.user_roles.user_roles_pkey
ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

-- public.interaction_media.interaction_media_interaction_id_media_id_key
ALTER TABLE ONLY public.interaction_media ADD CONSTRAINT interaction_media_interaction_id_media_id_key UNIQUE (interaction_id, media_id);

-- public.match_report_submissions.match_report_submissions_submission_key_key
ALTER TABLE ONLY public.match_report_submissions ADD CONSTRAINT match_report_submissions_submission_key_key UNIQUE (submission_key);

-- public.match_reports_cache.match_reports_cache_report_id_key
ALTER TABLE ONLY public.match_reports_cache ADD CONSTRAINT match_reports_cache_report_id_key UNIQUE (report_id);

-- public.purged_demo_records.purged_demo_records_table_name_fingerprint_key
ALTER TABLE ONLY public.purged_demo_records ADD CONSTRAINT purged_demo_records_table_name_fingerprint_key UNIQUE (table_name, fingerprint);

-- public.report_attachments.report_attachments_report_id_media_id_key
ALTER TABLE ONLY public.report_attachments ADD CONSTRAINT report_attachments_report_id_media_id_key UNIQUE (report_id, media_id);

-- public.user_roles.user_roles_user_id_role_key
ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- public.announcements.announcements_body_len
ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_body_len CHECK (char_length(body) <= 4000);

-- public.announcements.announcements_kind_check
ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_kind_check CHECK (kind = ANY (ARRAY['feature'::text, 'info'::text, 'incident'::text, 'downtime'::text]));

-- public.announcements.announcements_title_len
ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_title_len CHECK (char_length(title) >= 1 AND char_length(title) <= 160);

-- public.calendar_events.calendar_events_status_check
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'cancelled'::text]));

-- public.install_prompt_events.install_prompt_events_event_check
ALTER TABLE ONLY public.install_prompt_events ADD CONSTRAINT install_prompt_events_event_check CHECK (event = ANY (ARRAY['shown'::text, 'accepted'::text, 'dismissed'::text, 'failed'::text, 'installed'::text, 'manual_close'::text, 'retry'::text]));

-- public.install_prompt_events.install_prompt_events_surface_check
ALTER TABLE ONLY public.install_prompt_events ADD CONSTRAINT install_prompt_events_surface_check CHECK (surface = ANY (ARRAY['native'::text, 'ios'::text, 'failure'::text]));

-- public.interactions.interactions_deleted_pair_check
ALTER TABLE ONLY public.interactions ADD CONSTRAINT interactions_deleted_pair_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

-- public.interactions.interactions_type_check
ALTER TABLE ONLY public.interactions ADD CONSTRAINT interactions_type_check CHECK (interaction_type = ANY (ARRAY['Live Match Observation'::text, 'Training Ground Visit'::text, 'Coffee Catch Up'::text, 'Phone Call'::text]));

-- public.match_report_cutover_state.match_report_cutover_ready_proof
ALTER TABLE ONLY public.match_report_cutover_state ADD CONSTRAINT match_report_cutover_ready_proof CHECK (status = 'pending'::text OR expected_sheet_count > 0 AND run_id IS NOT NULL AND length(sheet_digest) = 64 AND reconciled_at IS NOT NULL AND length(TRIM(BOTH FROM reconciled_by_label)) > 0);

-- public.match_report_cutover_state.match_report_cutover_state_id_check
ALTER TABLE ONLY public.match_report_cutover_state ADD CONSTRAINT match_report_cutover_state_id_check CHECK (id = 'canonical'::text);

-- public.match_report_cutover_state.match_report_cutover_state_status_check
ALTER TABLE ONLY public.match_report_cutover_state ADD CONSTRAINT match_report_cutover_state_status_check CHECK (status = ANY (ARRAY['pending'::text, 'ready'::text]));

-- public.match_report_submissions.match_report_submissions_status_check
ALTER TABLE ONLY public.match_report_submissions ADD CONSTRAINT match_report_submissions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'ambiguous'::text, 'failed'::text]));

-- public.notifications.notifications_kind_check
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind = ANY (ARRAY['event_assigned'::text, 'event_updated'::text, 'event_unassigned'::text, 'event_cancelled'::text, 'follow_up_overdue'::text, 'support_thread_opened'::text, 'support_reply'::text]));

-- public.password_change_audit.password_change_audit_event_type_check
ALTER TABLE ONLY public.password_change_audit ADD CONSTRAINT password_change_audit_event_type_check CHECK (event_type = ANY (ARRAY['self_change'::text, 'admin_reset'::text, 'recovery_reset'::text]));

-- public.players.players_deleted_pair_check
ALTER TABLE ONLY public.players ADD CONSTRAINT players_deleted_pair_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

-- public.players.players_tier_check
ALTER TABLE ONLY public.players ADD CONSTRAINT players_tier_check CHECK (tier = ANY (ARRAY['Tier 1'::text, 'Tier 2'::text, 'Tier 3'::text, 'Tier 4'::text, 'Academy'::text, 'Free Agent'::text]));

-- public.support_messages.support_messages_body_len
ALTER TABLE ONLY public.support_messages ADD CONSTRAINT support_messages_body_len CHECK (char_length(body) >= 1 AND char_length(body) <= 4000);

-- public.support_threads.support_threads_kind_check
ALTER TABLE ONLY public.support_threads ADD CONSTRAINT support_threads_kind_check CHECK (kind = ANY (ARRAY['bug'::text, 'question'::text]));

-- public.support_threads.support_threads_severity_check
ALTER TABLE ONLY public.support_threads ADD CONSTRAINT support_threads_severity_check CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]));

-- public.support_threads.support_threads_status_check
ALTER TABLE ONLY public.support_threads ADD CONSTRAINT support_threads_status_check CHECK (status = ANY (ARRAY['open'::text, 'waiting_on_admin'::text, 'waiting_on_user'::text, 'resolved'::text]));

-- public.support_threads.support_threads_subject_len
ALTER TABLE ONLY public.support_threads ADD CONSTRAINT support_threads_subject_len CHECK (char_length(subject) >= 1 AND char_length(subject) <= 200);

-- public.announcement_reads.announcement_reads_announcement_id_fkey
ALTER TABLE ONLY public.announcement_reads ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;

-- public.announcement_reads.announcement_reads_user_id_fkey
ALTER TABLE ONLY public.announcement_reads ADD CONSTRAINT announcement_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- public.announcements.announcements_created_by_fkey
ALTER TABLE ONLY public.announcements ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;

-- public.calendar_event_audit.calendar_event_audit_calendar_event_id_fkey
ALTER TABLE ONLY public.calendar_event_audit ADD CONSTRAINT calendar_event_audit_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE CASCADE;

-- public.calendar_events.calendar_events_assigned_mentor_id_fkey
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_assigned_mentor_id_fkey FOREIGN KEY (assigned_mentor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- public.calendar_events.calendar_events_cancelled_by_fkey
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- public.calendar_events.calendar_events_created_by_fkey
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

-- public.calendar_events.calendar_events_follow_up_waived_by_fkey
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_follow_up_waived_by_fkey FOREIGN KEY (follow_up_waived_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- public.calendar_events.calendar_events_player_id_fkey
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;

-- public.dashboard_click_events.dashboard_click_events_user_id_fkey
ALTER TABLE ONLY public.dashboard_click_events ADD CONSTRAINT dashboard_click_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.install_prompt_events.install_prompt_events_user_id_fkey
ALTER TABLE ONLY public.install_prompt_events ADD CONSTRAINT install_prompt_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- public.interaction_audit.interaction_audit_interaction_id_fkey
ALTER TABLE ONLY public.interaction_audit ADD CONSTRAINT interaction_audit_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES interactions(id) ON DELETE CASCADE;

-- public.interaction_media.interaction_media_attached_by_fkey
ALTER TABLE ONLY public.interaction_media ADD CONSTRAINT interaction_media_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- public.interaction_media.interaction_media_interaction_id_fkey
ALTER TABLE ONLY public.interaction_media ADD CONSTRAINT interaction_media_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES interactions(id) ON DELETE CASCADE;

-- public.interaction_media.interaction_media_media_id_fkey
ALTER TABLE ONLY public.interaction_media ADD CONSTRAINT interaction_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE;

-- public.interactions.interactions_calendar_event_id_fkey
ALTER TABLE ONLY public.interactions ADD CONSTRAINT interactions_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;

-- public.interactions.interactions_mentor_id_fkey
ALTER TABLE ONLY public.interactions ADD CONSTRAINT interactions_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES profiles(id) ON DELETE RESTRICT;

-- public.interactions.interactions_player_id_fkey
ALTER TABLE ONLY public.interactions ADD CONSTRAINT interactions_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;

-- public.interactions.interactions_updated_by_fkey
ALTER TABLE ONLY public.interactions ADD CONSTRAINT interactions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- public.match_reports_cache.match_reports_cache_calendar_event_id_fkey
ALTER TABLE ONLY public.match_reports_cache ADD CONSTRAINT match_reports_cache_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;

-- public.notifications.notifications_calendar_event_id_fkey
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE CASCADE;

-- public.notifications.notifications_created_by_fkey
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- public.notifications.notifications_recipient_id_fkey
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- public.profiles.profiles_id_fkey
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.report_attachments.report_attachments_media_id_fkey
ALTER TABLE ONLY public.report_attachments ADD CONSTRAINT report_attachments_media_id_fkey FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE;

-- public.support_messages.support_messages_author_id_fkey
ALTER TABLE ONLY public.support_messages ADD CONSTRAINT support_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- public.support_messages.support_messages_thread_id_fkey
ALTER TABLE ONLY public.support_messages ADD CONSTRAINT support_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE;

-- public.support_threads.support_threads_author_id_fkey
ALTER TABLE ONLY public.support_threads ADD CONSTRAINT support_threads_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- public.user_roles.user_roles_user_id_fkey
ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
COMMIT;
