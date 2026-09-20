
-- Manual duty-of-care clock resets (e.g. heavy WhatsApp support), loggable by
-- mentor managers, admins and super admins. duty_of_care_at() folds the latest
-- reset into the same recency calculation used for qualifying interactions.
create table public.duty_of_care_resets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  reset_at timestamptz not null default now(),
  reason text not null default '',
  created_by uuid references public.profiles(id),
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.duty_of_care_resets is 'Manual duty-of-care clock resets logged by mentor managers/admins/super admins (e.g. heavy WhatsApp support in lieu of a formal interaction). duty_of_care_at() treats the latest reset_at as an additional qualifying contact date for the tier 1/2 recency calculation.';

alter table public.duty_of_care_resets enable row level security;

create policy duty_of_care_resets_select_authorised
on public.duty_of_care_resets for select
using (
  has_role((select auth.uid()), 'mentor'::app_role)
  or has_role((select auth.uid()), 'mentor_manager'::app_role)
  or has_role((select auth.uid()), 'admin'::app_role)
  or has_role((select auth.uid()), 'super_admin'::app_role)
);

create policy duty_of_care_resets_insert_managers
on public.duty_of_care_resets for insert
with check (
  created_by = (select auth.uid())
  and (
    has_role((select auth.uid()), 'mentor_manager'::app_role)
    or has_role((select auth.uid()), 'admin'::app_role)
    or has_role((select auth.uid()), 'super_admin'::app_role)
  )
);

-- Extend duty_of_care_at() to fold manual resets into last_interaction_at.
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
resolved as (
  select
    pb.*,
    tc.interval_days,
    tc.amber_lead_days,
    greatest(la.last_interaction_at, ra.last_reset_at) as last_interaction_at,
    sa.season_count,
    coalesce(ba.binding_total, 0) as binding_total,
    coalesce(ba.binding_due,   0) as binding_due,
    nx.due_on                     as next_due_at
  from pb
  join      season_agg sa on sa.player_id = pb.player_id
  left join tier_cfg   tc on tc.tier_key  = pb.tier_key
  left join last_any   la on la.player_id = pb.player_id
  left join resets_agg ra on ra.player_id = pb.player_id
  left join bind_agg   ba on ba.player_id = pb.player_id
  left join bind       nx on nx.player_id = pb.player_id
                         and nx.rn        = sa.season_count + 1
),
scored as (
  select r.*,
    case
      when r.tier_key = 'tier 3' then
        public.rpm_tier3_status(
          r.season_count, r.binding_total, r.binding_due,
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
  case when s.tier_key = 'tier 3' and s.season_count < s.binding_total
       then s.season_count + 1 end                                           as next_checkpoint_no,
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
