BEGIN;
CREATE VIEW public.player_duty_of_care WITH (security_invoker=on) AS
 SELECT player_id,
    full_name,
    current_club,
    tier,
    tier_effective_from,
    season_start,
    season_end,
    is_off_season,
    interval_days,
    last_interaction_at,
    season_count,
    period_target,
    checkpoints_due,
    next_checkpoint_no,
    next_due_at,
    days_until_due,
    state,
    rag_status,
    status_label,
    season_outcome
   FROM duty_of_care_at(CURRENT_DATE) duty_of_care_at(player_id, full_name, current_club, tier, tier_effective_from, season_start, season_end, is_off_season, interval_days, last_interaction_at, season_count, period_target, checkpoints_due, next_checkpoint_no, next_due_at, days_until_due, state, rag_status, status_label, season_outcome);;
COMMIT;
