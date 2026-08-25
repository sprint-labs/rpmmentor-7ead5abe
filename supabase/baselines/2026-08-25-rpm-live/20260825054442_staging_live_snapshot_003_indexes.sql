BEGIN;
-- public.announcements_active_starts_idx
CREATE INDEX announcements_active_starts_idx ON announcements USING btree (active, starts_at DESC);

-- public.calendar_event_audit_event_id_idx
CREATE INDEX calendar_event_audit_event_id_idx ON calendar_event_audit USING btree (calendar_event_id, changed_at DESC);

-- public.calendar_events_active_player_date_idx
CREATE INDEX calendar_events_active_player_date_idx ON calendar_events USING btree (player_id, event_date) WHERE status <> 'cancelled'::text;

-- public.calendar_events_assigned_mentor_date_idx
CREATE INDEX calendar_events_assigned_mentor_date_idx ON calendar_events USING btree (assigned_mentor_id, event_date);

-- public.calendar_events_date_idx
CREATE INDEX calendar_events_date_idx ON calendar_events USING btree (event_date);

-- public.calendar_events_status_date_idx
CREATE INDEX calendar_events_status_date_idx ON calendar_events USING btree (status, event_date DESC);

-- public.idx_dashboard_click_events_source
CREATE INDEX idx_dashboard_click_events_source ON dashboard_click_events USING btree (source);

-- public.idx_dashboard_click_events_user_created
CREATE INDEX idx_dashboard_click_events_user_created ON dashboard_click_events USING btree (user_id, created_at DESC);

-- public.idx_install_prompt_events_event_created
CREATE INDEX idx_install_prompt_events_event_created ON install_prompt_events USING btree (event, created_at DESC);

-- public.idx_install_prompt_events_user_created
CREATE INDEX idx_install_prompt_events_user_created ON install_prompt_events USING btree (user_id, created_at DESC);

-- public.idx_match_reports_cache_goalkeeper
CREATE INDEX idx_match_reports_cache_goalkeeper ON match_reports_cache USING btree (goalkeeper);

-- public.idx_match_reports_cache_match_date
CREATE INDEX idx_match_reports_cache_match_date ON match_reports_cache USING btree (match_date DESC);

-- public.idx_user_deletion_audit_created_at
CREATE INDEX idx_user_deletion_audit_created_at ON user_deletion_audit USING btree (created_at DESC);

-- public.interaction_audit_interaction_id_idx
CREATE INDEX interaction_audit_interaction_id_idx ON interaction_audit USING btree (interaction_id, changed_at DESC);

-- public.interaction_media_interaction_id_idx
CREATE INDEX interaction_media_interaction_id_idx ON interaction_media USING btree (interaction_id, created_at DESC);

-- public.interaction_media_media_id_idx
CREATE INDEX interaction_media_media_id_idx ON interaction_media USING btree (media_id);

-- public.interactions_active_occurred_at_idx
CREATE INDEX interactions_active_occurred_at_idx ON interactions USING btree (occurred_at DESC) WHERE deleted_at IS NULL;

-- public.interactions_calendar_event_id_key
CREATE UNIQUE INDEX interactions_calendar_event_id_key ON interactions USING btree (calendar_event_id) WHERE calendar_event_id IS NOT NULL AND deleted_at IS NULL;

-- public.interactions_match_report_id_key
CREATE UNIQUE INDEX interactions_match_report_id_key ON interactions USING btree (match_report_id) WHERE match_report_id IS NOT NULL AND deleted_at IS NULL;

-- public.interactions_mentor_id_idx
CREATE INDEX interactions_mentor_id_idx ON interactions USING btree (mentor_id);

-- public.interactions_occurred_at_idx
CREATE INDEX interactions_occurred_at_idx ON interactions USING btree (occurred_at DESC);

-- public.interactions_player_id_idx
CREATE INDEX interactions_player_id_idx ON interactions USING btree (player_id);

-- public.interactions_player_occurred_active_idx
CREATE INDEX interactions_player_occurred_active_idx ON interactions USING btree (player_id, occurred_at DESC) WHERE deleted_at IS NULL;

-- public.match_report_submissions_fingerprint_idx
CREATE INDEX match_report_submissions_fingerprint_idx ON match_report_submissions USING btree (fingerprint, submitted_at DESC);

-- public.match_report_submissions_key_uidx
CREATE UNIQUE INDEX match_report_submissions_key_uidx ON match_report_submissions USING btree (submission_key);

-- public.match_report_submissions_open_fingerprint_uidx
CREATE UNIQUE INDEX match_report_submissions_open_fingerprint_uidx ON match_report_submissions USING btree (fingerprint) WHERE status = ANY (ARRAY['pending'::text, 'ambiguous'::text]);

-- public.match_report_submissions_pending_fp_uidx
CREATE UNIQUE INDEX match_report_submissions_pending_fp_uidx ON match_report_submissions USING btree (fingerprint) WHERE status = 'pending'::text;

-- public.match_report_submissions_status_fingerprint_idx
CREATE INDEX match_report_submissions_status_fingerprint_idx ON match_report_submissions USING btree (fingerprint, status);

-- public.match_report_submissions_submitted_at_idx
CREATE INDEX match_report_submissions_submitted_at_idx ON match_report_submissions USING btree (submitted_at DESC);

-- public.match_report_submissions_succeeded_fp_idx
CREATE INDEX match_report_submissions_succeeded_fp_idx ON match_report_submissions USING btree (fingerprint, submitted_at DESC) WHERE status = 'succeeded'::text;

-- public.match_reports_cache_calendar_event_id_key
CREATE UNIQUE INDEX match_reports_cache_calendar_event_id_key ON match_reports_cache USING btree (calendar_event_id) WHERE calendar_event_id IS NOT NULL AND deleted_at IS NULL;

-- public.match_reports_cache_coach_idx
CREATE INDEX match_reports_cache_coach_idx ON match_reports_cache USING btree (coach);

-- public.match_reports_cache_legacy_report_id_idx
CREATE INDEX match_reports_cache_legacy_report_id_idx ON match_reports_cache USING btree (legacy_report_id) WHERE legacy_report_id IS NOT NULL;

-- public.match_reports_cache_live_match_date_idx
CREATE INDEX match_reports_cache_live_match_date_idx ON match_reports_cache USING btree (match_date DESC) WHERE deleted_at IS NULL;

-- public.match_reports_cache_submission_key_uidx
CREATE UNIQUE INDEX match_reports_cache_submission_key_uidx ON match_reports_cache USING btree (submission_key) WHERE submission_key IS NOT NULL;

-- public.media_assets_created_at_idx
CREATE INDEX media_assets_created_at_idx ON media_assets USING btree (created_at DESC);

-- public.media_assets_gk_id_idx
CREATE INDEX media_assets_gk_id_idx ON media_assets USING btree (gk_id);

-- public.media_audit_log_created_at_idx
CREATE INDEX media_audit_log_created_at_idx ON media_audit_log USING btree (created_at DESC);

-- public.notifications_overdue_once_key
CREATE UNIQUE INDEX notifications_overdue_once_key ON notifications USING btree (recipient_id, calendar_event_id) WHERE kind = 'follow_up_overdue'::text;

-- public.notifications_recipient_created_idx
CREATE INDEX notifications_recipient_created_idx ON notifications USING btree (recipient_id, created_at DESC);

-- public.notifications_recipient_unread_idx
CREATE INDEX notifications_recipient_unread_idx ON notifications USING btree (recipient_id) WHERE read_at IS NULL;

-- public.password_change_audit_created_at_idx
CREATE INDEX password_change_audit_created_at_idx ON password_change_audit USING btree (created_at DESC);

-- public.password_change_audit_user_id_idx
CREATE INDEX password_change_audit_user_id_idx ON password_change_audit USING btree (user_id);

-- public.players_full_name_lower_idx
CREATE UNIQUE INDEX players_full_name_lower_idx ON players USING btree (lower(full_name)) WHERE deleted_at IS NULL;

-- public.report_attachments_report_idx
CREATE INDEX report_attachments_report_idx ON report_attachments USING btree (report_id);

-- public.support_messages_thread_created_idx
CREATE INDEX support_messages_thread_created_idx ON support_messages USING btree (thread_id, created_at);

-- public.support_threads_author_last_message_idx
CREATE INDEX support_threads_author_last_message_idx ON support_threads USING btree (author_id, last_message_at DESC);

-- public.support_threads_status_last_message_idx
CREATE INDEX support_threads_status_last_message_idx ON support_threads USING btree (status, last_message_at DESC);
COMMIT;
