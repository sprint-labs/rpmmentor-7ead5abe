BEGIN;
-- public.calendar_events.calendar_events_audit -> public.calendar_events_write_audit
CREATE TRIGGER calendar_events_audit AFTER INSERT OR UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_events_write_audit();

-- public.calendar_events.calendar_events_set_updated_at -> public.set_updated_at
CREATE TRIGGER calendar_events_set_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- public.interactions.interactions_audit -> public.interactions_write_audit
CREATE TRIGGER interactions_audit AFTER INSERT OR UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION interactions_write_audit();

-- public.interactions.interactions_block_purged_demo -> public.block_purged_demo_interactions
CREATE TRIGGER interactions_block_purged_demo BEFORE INSERT OR UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION block_purged_demo_interactions();

-- public.interactions.interactions_guard_immutable -> public.interactions_guard_immutable_columns
CREATE TRIGGER interactions_guard_immutable BEFORE INSERT OR UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION interactions_guard_immutable_columns();

-- public.interactions.interactions_set_updated_at -> public.set_updated_at
CREATE TRIGGER interactions_set_updated_at BEFORE UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- public.match_report_cutover_state.match_report_cutover_state_set_updated_at -> public.set_updated_at
CREATE TRIGGER match_report_cutover_state_set_updated_at BEFORE UPDATE ON match_report_cutover_state FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- public.match_report_submissions.match_report_submissions_set_updated_at -> public.set_updated_at
CREATE TRIGGER match_report_submissions_set_updated_at BEFORE UPDATE ON match_report_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- public.match_report_submissions.match_report_submissions_status_check -> public.match_report_submissions_status_check
CREATE TRIGGER match_report_submissions_status_check BEFORE INSERT OR UPDATE ON match_report_submissions FOR EACH ROW EXECUTE FUNCTION match_report_submissions_status_check();

-- public.match_reports_cache.match_reports_cache_set_updated_at -> public.set_updated_at
CREATE TRIGGER match_reports_cache_set_updated_at BEFORE UPDATE ON match_reports_cache FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- public.media_assets.media_assets_set_updated_at -> public.set_updated_at
CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- public.notifications.notifications_guard_read_state -> public.notifications_guard_read_state_only
CREATE TRIGGER notifications_guard_read_state BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION notifications_guard_read_state_only();

-- public.players.players_guard_club_only -> public.players_guard_club_only_update
CREATE TRIGGER players_guard_club_only BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION players_guard_club_only_update();

-- public.players.players_guard_deletion_metadata -> public.players_guard_deletion_metadata
CREATE TRIGGER players_guard_deletion_metadata BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION players_guard_deletion_metadata();

-- public.players.players_prevent_client_hard_delete -> public.players_prevent_client_hard_delete
CREATE TRIGGER players_prevent_client_hard_delete BEFORE DELETE ON players FOR EACH ROW EXECUTE FUNCTION players_prevent_client_hard_delete();

-- public.players.players_set_updated_at -> public.set_updated_at
CREATE TRIGGER players_set_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- public.players.players_tier_effective_from_trg -> public.players_set_tier_effective_from
CREATE TRIGGER players_tier_effective_from_trg BEFORE INSERT OR UPDATE OF tier, tier_effective_from ON players FOR EACH ROW EXECUTE FUNCTION players_set_tier_effective_from();

-- public.support_messages.support_messages_after_insert -> public.support_messages_after_insert
CREATE TRIGGER support_messages_after_insert AFTER INSERT ON support_messages FOR EACH ROW EXECUTE FUNCTION support_messages_after_insert();

-- public.support_threads.support_threads_set_updated_at -> public.set_updated_at
CREATE TRIGGER support_threads_set_updated_at BEFORE UPDATE ON support_threads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- auth.users.on_auth_user_created -> public.handle_new_user
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
COMMIT;
