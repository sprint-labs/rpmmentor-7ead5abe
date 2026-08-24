-- =============================================================================
-- 02 — Duty of Care engine
-- RPM Mentor Hub · Supabase project zdxxezquhvpjmoxlecjp
-- Author: Sprint Labs · 2026-08-24
--
-- REQUIRES 01_players_tier_effective_from.sql to have run first.
--
-- WHAT THIS ADDS
--   public.interaction_types          lookup: which types are qualifying live contact
--   public.rpm_season_start(date)     season anchor  (14 August)
--   public.rpm_season_end(date)       season close   (31 May)
--   public.rpm_season_checkpoints()   the six fixed cumulative milestones
--   public.rpm_tier3_status()         pure decision function — unit testable
--   public.rpm_recency_status()       pure decision function — unit testable
--   public.duty_of_care_at(date)      the read model, parameterised by date
--   public.player_duty_of_care        thin view: duty_of_care_at(current_date)
--   one composite index on interactions
--
-- WHAT THIS DOES NOT DO
--   Alters no existing table, column, policy or row. Writes to nothing.
--
-- HOW TO RUN
--   Single batch. Do NOT add BEGIN/COMMIT — the Supabase CLI already wraps
--   migrations in a transaction and a stray COMMIT will commit early.
--
--
-- THE TIER 3 RULE
--   Season      14 August to 31 May. RPM's own operational season, not the
--               Premier League's — clients play across all four English tiers,
--               which start on different dates.
--   Span        290 days (2026/27). 290 / 6 = 48.33, so the six checkpoints are
--               near-equal windows of 48 or 49 days.
--   Checkpoints Derived, not hardcoded — no annual maintenance. For 2026/27:
--               1 Oct, 19 Nov, 6 Jan, 23 Feb, 13 Apr, 31 May.
--   Counting    Cumulative. Interaction N satisfies checkpoint N. Early contact
--               is credited forward; a late contact never pushes a later
--               obligation out, because the dates are fixed.
--   Red         fewer interactions than the checkpoints already reached
--   Amber       on pace, next unmet checkpoint within 14 days
--   Green       on or ahead of pace, outside the warning window
--   Complete    all binding checkpoints met
--   Off season  1 June to 13 August — shows Off season, not Red. The finished
--               season's outcome is preserved in season_outcome.
--
--   Superseded design note: an earlier draft used a rolling
--   "last interaction + 48 days" rule. It was wrong. Because the clock reset on
--   every contact, a single late interaction erased all prior misses — a player
--   on 3 of 6 on 20 May would show amber rather than red. Fixed checkpoints do
--   not have this failure mode: a missed checkpoint stays missed.
--
--
-- TIER 1 AND TIER 2 — deliberately unchanged
--   Preserved as the existing recency model: days since the LATEST qualifying
--   interaction against a rolling interval (15 days for Tier 1, 30 for Tier 2).
--   No qualifying contact returns "Not enough data", not Overdue.
--
--   >>> The amber lead times (3 and 7 days) are the only values here I could not
--   >>> read from the codebase. Confirm against src/lib/mock-data.ts:538 and
--   >>> adjust the tier_cfg block below if they differ. Nothing else about
--   >>> Tier 1 or Tier 2 behaviour changes.
--
--
-- CANONICAL LINKAGE
--   Qualifying interactions are keyed on interactions.player_id ONLY. Never
--   gk_slug, never goalkeeper_name. As of today 17 of 41 linked interactions
--   are report-created Live Match Observations with an empty slug — 41% of
--   qualifying contact that the current slug-keyed engine cannot see.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Interaction types lookup
--
-- CONFIRMED against src/lib/interactions/schema.ts:28 — the qualifying set is
-- Live Match Observation, Training Ground Visit and Coffee Catch Up. Phone Call
-- is explicitly non-qualifying. Do not change without RPM sign-off.
-- -----------------------------------------------------------------------------

create table if not exists public.interaction_types (
  name            text primary key,
  counts_as_live  boolean     not null default false,
  sort_order      integer     not null default 100,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.interaction_types is
  'Lookup for interaction types. counts_as_live defines a qualifying live interaction for duty of care. Mirrors src/lib/interactions/schema.ts — keep the two in step.';

insert into public.interaction_types (name, counts_as_live, sort_order) values
  ('Live Match Observation', true,  10),
  ('Training Ground Visit',  true,  20),
  ('Coffee Catch Up',        true,  30),
  ('Phone Call',             false, 40)
on conflict (name) do nothing;

-- Safety net: register any other value already in the data as non-qualifying,
-- so a type nobody knew about can never be silently counted.
insert into public.interaction_types (name, counts_as_live, sort_order)
select distinct i.interaction_type, false, 900
from public.interactions i
where i.interaction_type is not null
  and btrim(i.interaction_type) <> ''
on conflict (name) do nothing;

-- No FK from interactions.interaction_type on purpose: it would reject any new
-- type the app writes before it is registered. Add it once the app writes
-- through this lookup.

alter table public.interaction_types enable row level security;

drop policy if exists "Authenticated can read interaction types" on public.interaction_types;
create policy "Authenticated can read interaction types"
  on public.interaction_types for select to authenticated using (true);

drop policy if exists "Super admins manage interaction types" on public.interaction_types;
create policy "Super admins manage interaction types"
  on public.interaction_types for all to authenticated
  using      (public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'super_admin'::public.app_role));

grant select on public.interaction_types to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Season boundaries
-- -----------------------------------------------------------------------------

create or replace function public.rpm_season_start(d date)
returns date language sql immutable set search_path = '' as $$
  select case
    when d >= make_date(extract(year from d)::int, 8, 14)
      then make_date(extract(year from d)::int, 8, 14)
    else make_date(extract(year from d)::int - 1, 8, 14)
  end;
$$;

comment on function public.rpm_season_start(date) is
  'Start of the RPM operational season (14 August) containing the given date.';

create or replace function public.rpm_season_end(d date)
returns date language sql immutable set search_path = '' as $$
  select make_date(extract(year from public.rpm_season_start(d))::int + 1, 5, 31);
$$;

comment on function public.rpm_season_end(date) is
  'End of the RPM operational season (31 May). Dates from 1 June to 13 August fall after this and are treated as off season.';


-- -----------------------------------------------------------------------------
-- 3. The six fixed cumulative checkpoints
--
-- Derived from the season span so future seasons — including leap years, where
-- the span is 291 rather than 290 — need no maintenance. Checkpoint 6 always
-- lands exactly on 31 May.
-- -----------------------------------------------------------------------------

create or replace function public.rpm_season_checkpoints(as_of date, target integer default 6)
returns table (checkpoint_no integer, due_on date)
language sql immutable set search_path = '' as $$
  select
    n::integer,
    least(
      public.rpm_season_start(as_of)
        + round(
            (n::numeric * (public.rpm_season_end(as_of) - public.rpm_season_start(as_of)))
            / target
          )::integer,
      public.rpm_season_end(as_of)
    )
  from generate_series(1, target) as n;
$$;

comment on function public.rpm_season_checkpoints(date, integer) is
  'The fixed cumulative duty of care checkpoints for the season containing as_of. Six near-equal windows, the last always ending on 31 May.';


-- -----------------------------------------------------------------------------
-- 4. Pure decision functions
--
-- Deliberately separated from the read model so the RAG rules can be unit
-- tested against a table of scenarios with no fixtures. See 03_tests.sql.
-- -----------------------------------------------------------------------------

create or replace function public.rpm_tier3_status(
  p_season_count   integer,
  p_binding_total  integer,
  p_binding_due    integer,
  p_next_due_at    date,
  p_as_of          date,
  p_is_off_season  boolean,
  p_amber_lead     integer default 14
)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_is_off_season                          then 'off_season'
    when coalesce(p_binding_total, 0) = 0         then 'not_required'
    when p_season_count >= p_binding_total        then 'complete'
    when p_season_count <  p_binding_due          then 'red'
    when p_next_due_at is null                    then 'green'
    when p_next_due_at <= p_as_of + p_amber_lead  then 'amber'
    else 'green'
  end;
$$;

comment on function public.rpm_tier3_status(integer, integer, integer, date, date, boolean, integer) is
  'Tier 3 seasonal pacing decision. Returns off_season, not_required, complete, red, amber or green.';

create or replace function public.rpm_recency_status(
  p_last_at        date,
  p_interval_days  integer,
  p_as_of          date,
  p_amber_lead     integer
)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_last_at is null                                     then 'no_data'
    when p_last_at + p_interval_days <  p_as_of                then 'red'
    when p_last_at + p_interval_days <= p_as_of + p_amber_lead then 'amber'
    else 'green'
  end;
$$;

comment on function public.rpm_recency_status(date, integer, date, integer) is
  'Existing Tier 1 / Tier 2 recency model, unchanged: interval since the latest qualifying interaction. No contact returns no_data, not red.';


-- -----------------------------------------------------------------------------
-- 5. Supporting index
-- -----------------------------------------------------------------------------

create index if not exists interactions_player_occurred_active_idx
  on public.interactions (player_id, occurred_at desc)
  where deleted_at is null;


-- -----------------------------------------------------------------------------
-- 6. The read model
--
-- Parameterised by date so season boundaries, the 31 May deadline and historic
-- states are all testable. SECURITY INVOKER by default — RLS on players and
-- interactions applies to whoever calls it. Do not add SECURITY DEFINER.
-- -----------------------------------------------------------------------------

create or replace function public.duty_of_care_at(as_of date)
returns table (
  player_id            uuid,
  full_name            text,
  current_club         text,
  tier                 text,
  tier_effective_from  date,
  season_start         date,
  season_end           date,
  is_off_season        boolean,
  interval_days        integer,
  last_interaction_at  date,
  season_count         integer,
  period_target        integer,
  checkpoints_due      integer,
  next_checkpoint_no   integer,
  next_due_at          date,
  days_until_due       integer,
  state                text,
  rag_status           text,
  status_label         text,
  season_outcome       text
)
language sql stable set search_path = '' as $$
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
  where i.deleted_at is null        -- exclude deleted
    and i.player_id is not null     -- canonical link only; never slug or name
    and i.occurred_at <= as_of      -- exclude future-dated
),
last_any as (
  select q.player_id, max(q.occurred_at) as last_interaction_at
  from qualifying q group by q.player_id
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
    la.last_interaction_at,
    sa.season_count,
    coalesce(ba.binding_total, 0) as binding_total,
    coalesce(ba.binding_due,   0) as binding_due,
    nx.due_on                     as next_due_at
  from pb
  join      season_agg sa on sa.player_id = pb.player_id
  left join tier_cfg   tc on tc.tier_key  = pb.tier_key
  left join last_any   la on la.player_id = pb.player_id
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
$$;

comment on function public.duty_of_care_at(date) is
  'Duty of care read model as at a given date. Tier 1: 15-day recency. Tier 2: 30-day recency. Tier 3: six fixed cumulative checkpoints across the RPM season (14 Aug - 31 May), pro-rated by players.tier_effective_from. Tier 4 and unassigned: not required. Qualifying types come from public.interaction_types; interactions are keyed on player_id only.';


-- -----------------------------------------------------------------------------
-- 7. Thin current-date view — what the dashboards read
-- -----------------------------------------------------------------------------

create or replace view public.player_duty_of_care
with (security_invoker = on)
as select * from public.duty_of_care_at(current_date);

comment on view public.player_duty_of_care is
  'Today''s duty of care status for every active player. Thin wrapper over duty_of_care_at(current_date). Every dashboard, list and insight surface should read this rather than recalculating client-side.';

grant execute on function public.rpm_season_start(date)        to authenticated;
grant execute on function public.rpm_season_end(date)          to authenticated;
grant execute on function public.rpm_season_checkpoints(date, integer) to authenticated;
grant execute on function public.duty_of_care_at(date)         to authenticated;
grant select  on public.player_duty_of_care                    to authenticated;
