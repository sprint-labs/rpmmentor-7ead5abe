BEGIN;
-- public.announcement_reads
COMMENT ON TABLE public.announcement_reads IS 'Per-user dismiss state for announcements. Dismissing an incident removes it from the bell, not the banner.';

-- public.announcements
COMMENT ON TABLE public.announcements IS 'One-to-everyone Super Admin broadcasts. Read state lives in announcement_reads; do not fan out into notifications.';

-- public.interaction_media
COMMENT ON TABLE public.interaction_media IS 'Links a media_assets row (e.g. an interaction voice recording) to the interaction it belongs to. Linkage is by primary key only — never by goalkeeper name or file name.';

-- public.interaction_types
COMMENT ON TABLE public.interaction_types IS 'Lookup for interaction types. counts_as_live defines a qualifying live interaction for duty of care. Mirrors src/lib/interactions/schema.ts -- keep the two in step.';

-- public.match_reports_cache
COMMENT ON TABLE public.match_reports_cache IS 'CANONICAL Match Reports store (runtime source of truth). Historically a mirror of the "GKHQ Propietry Data Hub" Google Sheet, which is now a dormant archive/rollback source only — no runtime read or write path depends on it. Rows are written by submitMatchReport and by the one-time Sheet backfill; they are never pruned against the Sheet.';

-- public.player_duty_of_care
COMMENT ON VIEW public.player_duty_of_care IS 'Today''s duty of care status for every active player. Thin wrapper over duty_of_care_at(current_date). Every dashboard, list and insight surface should read this rather than recalculating client-side.';

-- public.support_messages
COMMENT ON TABLE public.support_messages IS 'Append-only messages in a support thread. Status bumps and bell notifications are written by a SECURITY DEFINER trigger.';

-- public.support_threads
COMMENT ON TABLE public.support_threads IS 'One-to-one support threads (bug reports and questions). Mentors own their threads; Super Admin sees all.';

-- public.calendar_events.assigned_mentor_id
COMMENT ON COLUMN public.calendar_events.assigned_mentor_id IS 'Profile of the mentor expected to attend. Null only for events scheduled before mentors were assignable, or where that profile was deleted.';

-- public.interaction_media.attached_by
COMMENT ON COLUMN public.interaction_media.attached_by IS 'profiles.id of whoever attached the media. Enforced to equal auth.uid() on insert.';

-- public.interactions.deleted_at
COMMENT ON COLUMN public.interactions.deleted_at IS 'Recoverable product deletion timestamp. NULL means active.';

-- public.interactions.deleted_by
COMMENT ON COLUMN public.interactions.deleted_by IS 'Authenticated Super Admin UUID that tombstoned the interaction. Deliberately retained without an FK so later account removal cannot erase provenance.';

-- public.interactions.match_report_id
COMMENT ON COLUMN public.interactions.match_report_id IS 'Originating Match Report identity (match_reports_cache.report_id). NULL for manually logged interactions.';

-- public.interactions.updated_by
COMMENT ON COLUMN public.interactions.updated_by IS 'profiles.id of whoever last edited this interaction. NULL if never edited.';

-- public.match_reports_cache.deleted_at
COMMENT ON COLUMN public.match_reports_cache.deleted_at IS 'Soft-delete tombstone. Non-NULL rows are excluded from every runtime read and are skipped (not resurrected) by a re-run of the Sheet backfill.';

-- public.match_reports_cache.legacy_report_id
COMMENT ON COLUMN public.match_reports_cache.legacy_report_id IS 'Pre-Team identity (mr_<hash> of goalkeeper|match_date|opponent). Resolution only — never the primary identity.';

-- public.match_reports_cache.report_id
COMMENT ON COLUMN public.match_reports_cache.report_id IS 'Deterministic identity (mr2_<hash> of goalkeeper|team|opponent|match_date), with a ~2/~3 occurrence suffix for confirmed duplicate fixtures. Stable across the Sheet backfill and app submissions.';

-- public.match_reports_cache.row_index
COMMENT ON COLUMN public.match_reports_cache.row_index IS 'Legacy Google Sheet row number (1-based) this report was imported from. Traceability back to the archive only; nothing reads or writes the Sheet by it at runtime.';

-- public.match_reports_cache.source
COMMENT ON COLUMN public.match_reports_cache.source IS 'Provenance: ''sheet'' for the one-time Google Sheets backfill, ''app'' for reports submitted to Supabase directly.';

-- public.match_reports_cache.submitted_at
COMMENT ON COLUMN public.match_reports_cache.submitted_at IS 'When the report was submitted through the app. NULL for backfilled Sheet history.';

-- public.match_reports_cache.synced_at
COMMENT ON COLUMN public.match_reports_cache.synced_at IS 'Import/reconciliation time, NOT a submit time. Never use for duplicate windows — use submitted_at.';

-- public.media_assets.gk_id
COMMENT ON COLUMN public.media_assets.gk_id IS 'Optional goalkeeper grouping key. New explicit links use canonical public.players.id; historical rows may contain legacy gk-* slugs; NULL means unlinked central-library media.';

-- public.players.deleted_at
COMMENT ON COLUMN public.players.deleted_at IS 'Recoverable product deletion timestamp. NULL means active.';

-- public.players.deleted_by
COMMENT ON COLUMN public.players.deleted_by IS 'Authenticated Super Admin UUID that tombstoned the player record. Deliberately retained without an FK so later account removal cannot erase provenance.';

-- public.players.tier
COMMENT ON COLUMN public.players.tier IS 'Client service tier. Drives duty of care obligations: Tier 1 and Tier 2 use rolling recency intervals, Tier 3 uses six fixed seasonal checkpoints, Tier 4 / Academy / Free Agent carry no formal requirement.';

-- public.players.tier_effective_from
COMMENT ON COLUMN public.players.tier_effective_from IS 'Date the player''s current tier took effect. NULL means "since the start of the current season". Used to pro-rate Tier 3 seasonal checkpoints for mid-season reassignments. Maintained automatically by trigger players_tier_effective_from_trg.';

-- public.duty_of_care_at(as_of date)
COMMENT ON FUNCTION public.duty_of_care_at(as_of date) IS 'Duty of care read model as at a given date. Tier 1: 15-day recency. Tier 2: 30-day recency. Tier 3: six fixed cumulative checkpoints across the RPM season (14 Aug - 31 May), pro-rated by players.tier_effective_from. Tier 4 and unassigned: not required. Qualifying types come from public.interaction_types; interactions are keyed on player_id only.';

-- public.rpm_recency_status(p_last_at date, p_interval_days integer, p_as_of date, p_amber_lead integer)
COMMENT ON FUNCTION public.rpm_recency_status(p_last_at date, p_interval_days integer, p_as_of date, p_amber_lead integer) IS 'Existing Tier 1 / Tier 2 recency model, unchanged: interval since the latest qualifying interaction. No contact returns no_data, not red.';

-- public.rpm_season_checkpoints(as_of date, target integer)
COMMENT ON FUNCTION public.rpm_season_checkpoints(as_of date, target integer) IS 'The fixed cumulative duty of care checkpoints for the season containing as_of. Six near-equal windows, the last always ending on 31 May.';

-- public.rpm_season_end(d date)
COMMENT ON FUNCTION public.rpm_season_end(d date) IS 'End of the RPM operational season (31 May). Dates from 1 June to 13 August fall after this and are treated as off season.';

-- public.rpm_season_start(d date)
COMMENT ON FUNCTION public.rpm_season_start(d date) IS 'Start of the RPM operational season (14 August) containing the given date.';

-- public.rpm_tier3_status(p_season_count integer, p_binding_total integer, p_binding_due integer, p_next_due_at date, p_as_of date, p_is_off_season boolean, p_amber_lead integer)
COMMENT ON FUNCTION public.rpm_tier3_status(p_season_count integer, p_binding_total integer, p_binding_due integer, p_next_due_at date, p_as_of date, p_is_off_season boolean, p_amber_lead integer) IS 'Tier 3 seasonal pacing decision. Returns off_season, not_required, complete, red, amber or green.';
COMMIT;
