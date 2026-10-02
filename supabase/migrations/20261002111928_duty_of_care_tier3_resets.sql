-- Duty-of-care resets now count for Tier 3 goalkeepers.
--
-- 20260915174038_duty_of_care_manual_resets folded the latest reset into
-- last_interaction_at, but only the Tier 1 / Tier 2 recency rule reads that
-- column. Tier 3 is scored on checkpoints met (season_count against the
-- checkpoints already due), so a reset recorded against a Tier 3 goalkeeper
-- changed nothing: once the first checkpoint passed on 1 Oct 2026 the
-- goalkeeper stayed Overdue however many times management reset the status.
--
-- A reset now means the same thing for every tier: the goalkeeper is up to date
-- as of that day. For Tier 3, every checkpoint already due on the date of the
-- latest reset counts as met, and qualifying contact logged after the reset
-- counts toward the checkpoints that follow. A goalkeeper already ahead of pace
-- keeps the real count. Repeating a reset on the same day changes nothing.
--
-- season_count stays the real number of qualifying contacts and season_outcome
-- is still judged on those contacts alone, so a reset can clear an Overdue
-- badge but can never record a season target as met. Tier 1 / Tier 2 and every
-- other output column are unchanged.
CREATE OR REPLACE FUNCTION public.duty_of_care_at(as_of date)
 RETURNS TABLE(player_id uuid, full_name text, current_club text, tier text, tier_effective_from date, season_start date, season_end date, is_off_season boolean, interval_days integer, last_interaction_at date, season_count integer, period_target integer, checkpoints_due integer, next_checkpoint_no integer, next_due_at date, days_until_due integer, state text, rag_status text, status_label text, season_outcome text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with cfg as (
  select
    public.rpm_season_start(as_of) as season_start,
    public.rpm_season_end(as_of)   as season_end,
    14                             as tier3_amber_lead
),
-- Verified against src/lib/mock-data.ts:609-614 on 2026-08-24. The frontend
-- rule is `days > floor(interval * 0.75)`, so amber_lead encodes
-- interval - floor(interval * 0.75) - 1. Tier 1: 15 - 11 - 1 = 3.
-- Tier 2: 30 - 22 - 1 = 7. Do not refactor to the formula.
tier_cfg (tier_key, interval_days, amber_lead_days) as (
  values ('tier 1'::text, 15, 3),
         ('tier 2'::text, 30, 7)
),
qualifying as (
  select i.player_id, i.occurred_at
  from public.interactions i
  join public.interaction_types t
    on t.name = i.interaction_type
   and t.counts_as_live
  where i.deleted_at is null
    and i.player_id is not null
    and i.occurred_at <= as_of
),
last_any as (
  select q.player_id, max(q.occurred_at) as last_interaction_at
  from qualifying q group by q.player_id
),
resets_agg as (
  select r.player_id, max(r.reset_at)::date as last_reset_at
  from public.duty_of_care_resets r
  where r.reset_at::date <= as_of
  group by r.player_id
),
pb as (
  select
    pl.id as player_id, pl.full_name, pl.current_club, pl.tier,
    lower(coalesce(nullif(btrim(pl.tier), ''), 'unassigned')) as tier_key,
    pl.tier_effective_from,
    greatest(c.season_start, coalesce(pl.tier_effective_from, c.season_start)) as effective_start,
    c.season_start, c.season_end, c.tier3_amber_lead,
    (as_of > c.season_end) as is_off_season
  from public.players pl
  cross join cfg c
  where pl.deleted_at is null
),
season_agg as (
  select pb.player_id, count(q.player_id)::integer as season_count
  from pb
  left join qualifying q
    on q.player_id     = pb.player_id
   and q.occurred_at  >= pb.effective_start
   and q.occurred_at  <= least(as_of, pb.season_end)
  group by pb.player_id
),
bind as (
  select pb.player_id, cp.due_on,
         row_number() over (partition by pb.player_id order by cp.due_on)::integer as rn
  from pb
  cross join public.rpm_season_checkpoints(as_of, 6) cp
  where cp.due_on >= pb.effective_start
),
bind_agg as (
  select b.player_id,
         count(*)::integer                                  as binding_total,
         count(*) filter (where b.due_on <= as_of)::integer  as binding_due
  from bind b group by b.player_id
),
-- Checkpoints a reset has met. Every checkpoint already due on the latest reset
-- date is cleared; contact after the reset counts on from there. A reset from
-- an earlier season, or from before the tier took effect, clears nothing.
reset_credit as (
  select
    pb.player_id,
    greatest(
      sa.season_count,
      (select count(*)::integer from bind b
        where b.player_id = pb.player_id
          and b.due_on   <= ra.last_reset_at)
      +
      (select count(*)::integer from qualifying q
        where q.player_id    = pb.player_id
          and q.occurred_at  > ra.last_reset_at
          and q.occurred_at >= pb.effective_start
          and q.occurred_at <= least(as_of, pb.season_end))
    ) as checkpoints_met
  from pb
  join season_agg sa on sa.player_id = pb.player_id
  join resets_agg ra on ra.player_id = pb.player_id
),
resolved as (
  select
    pb.*,
    tc.interval_days,
    tc.amber_lead_days,
    greatest(la.last_interaction_at, ra.last_reset_at) as last_interaction_at,
    sa.season_count,
    coalesce(rc.checkpoints_met, sa.season_count) as checkpoints_met,
    coalesce(ba.binding_total, 0) as binding_total,
    coalesce(ba.binding_due,   0) as binding_due,
    nx.due_on                     as next_due_at
  from pb
  join      season_agg   sa on sa.player_id = pb.player_id
  left join tier_cfg     tc on tc.tier_key  = pb.tier_key
  left join last_any     la on la.player_id = pb.player_id
  left join resets_agg   ra on ra.player_id = pb.player_id
  left join reset_credit rc on rc.player_id = pb.player_id
  left join bind_agg     ba on ba.player_id = pb.player_id
  left join bind         nx on nx.player_id = pb.player_id
                           and nx.rn        = coalesce(rc.checkpoints_met, sa.season_count) + 1
),
scored as (
  select r.*,
    case
      when r.tier_key = 'tier 3' then
        public.rpm_tier3_status(
          r.checkpoints_met, r.binding_total, r.binding_due,
          r.next_due_at, as_of, r.is_off_season, r.tier3_amber_lead)
      when r.interval_days is not null then
        public.rpm_recency_status(
          r.last_interaction_at, r.interval_days, as_of, r.amber_lead_days)
      else 'not_required'
    end as state
  from resolved r
)
select
  s.player_id,
  s.full_name,
  s.current_club,
  s.tier,
  s.tier_effective_from,
  s.season_start,
  s.season_end,
  s.is_off_season,
  s.interval_days,
  s.last_interaction_at,
  s.season_count,
  case when s.tier_key = 'tier 3' then s.binding_total end                   as period_target,
  case when s.tier_key = 'tier 3' then s.binding_due   end                   as checkpoints_due,
  case when s.tier_key = 'tier 3' and s.checkpoints_met < s.binding_total
       then s.checkpoints_met + 1 end                                        as next_checkpoint_no,
  case when s.tier_key = 'tier 3' then s.next_due_at end                     as next_due_at,
  case when s.tier_key = 'tier 3' then (s.next_due_at - as_of)::integer end   as days_until_due,
  s.state,
  case s.state
    when 'red'      then 'red'
    when 'amber'    then 'amber'
    when 'green'    then 'green'
    when 'complete' then 'green'
    else 'none'
  end as rag_status,
  case s.state
    when 'off_season'    then 'Off season'
    when 'not_required'  then 'Not required'
    when 'no_data'       then 'Not enough data'
    when 'complete'      then 'Complete'
    when 'red'           then 'Overdue'
    when 'amber'         then 'Due soon'
    else 'Up to date'
  end as status_label,
  case
    when s.tier_key <> 'tier 3'                                       then null
    when s.binding_total > 0 and s.season_count >= s.binding_total    then 'met'
    when s.is_off_season                                              then 'not_met'
    else null
  end as season_outcome
from scored s;
$function$;

comment on table public.duty_of_care_resets is 'Manual duty-of-care clock resets logged by mentor managers/admins/super admins (e.g. heavy WhatsApp support in lieu of a formal interaction). duty_of_care_at() treats the latest reset_at as an additional contact date for the Tier 1/2 recency calculation, and as meeting every Tier 3 checkpoint already due on that date.';
