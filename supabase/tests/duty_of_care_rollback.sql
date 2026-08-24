-- =============================================================================
-- 04 — ROLLBACK
-- Reverses 02_duty_of_care_engine.sql and 01_players_tier_effective_from.sql.
-- Run top to bottom. Drop order matters — dependants first.
--
-- The final block drops players.tier_effective_from and is DESTRUCTIVE: any
-- recorded tier-change dates are lost. It is left commented out. Uncomment
-- deliberately.
-- =============================================================================


-- ---- 02: engine -------------------------------------------------------------

drop view     if exists public.player_duty_of_care;

drop function if exists public.duty_of_care_at(date);
drop function if exists public.rpm_recency_status(date, integer, date, integer);
drop function if exists public.rpm_tier3_status(integer, integer, integer, date, date, boolean, integer);
drop function if exists public.rpm_season_checkpoints(date, integer);
drop function if exists public.rpm_season_end(date);
drop function if exists public.rpm_season_start(date);

drop index    if exists public.interactions_player_occurred_active_idx;

drop policy   if exists "Authenticated can read interaction types" on public.interaction_types;
drop policy   if exists "Super admins manage interaction types"    on public.interaction_types;
drop table    if exists public.interaction_types;


-- ---- 01: tier effective date ------------------------------------------------

drop trigger  if exists players_tier_effective_from_trg on public.players;
drop function if exists public.players_set_tier_effective_from();

-- DESTRUCTIVE — uncomment only if you are sure.
-- alter table public.players drop column if exists tier_effective_from;
