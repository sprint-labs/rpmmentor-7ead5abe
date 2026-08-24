-- =============================================================================
-- 03 — Duty of Care test suite
-- Run AFTER 01 and 02. Entirely read-only. No fixtures, no data written.
--
-- Groups A to D are deterministic: they exercise the pure functions against
-- fixed dates and known inputs, so they give the same result whenever they run.
-- Groups E and F assert against live data and will move as data moves — read
-- the notes on those.
--
-- Every row should read PASS. Anything else is a regression.
-- =============================================================================


-- =============================================================================
-- GROUPS A-D · Deterministic
-- =============================================================================

with t (test, expected, actual) as (values

-- -----------------------------------------------------------------------------
-- A. Season boundaries
-- -----------------------------------------------------------------------------
('A1  13 Aug is the previous season',
 '2025-08-14', public.rpm_season_start(date '2026-08-13')::text),
('A2  14 Aug opens the new season',
 '2026-08-14', public.rpm_season_start(date '2026-08-14')::text),
('A3  season ends 31 May',
 '2027-05-31', public.rpm_season_end(date '2026-08-14')::text),
('A4  Christmas resolves to the right season',
 '2026-08-14', public.rpm_season_start(date '2026-12-25')::text),
('A5  31 May is still in season',
 'false', (date '2027-05-31' > public.rpm_season_end(date '2027-05-31'))::text),
('A6  1 June is off season',
 'true',  (date '2027-06-01' > public.rpm_season_end(date '2027-06-01'))::text),
('A7  off season resolves to the season just finished',
 '2027-05-31', public.rpm_season_end(date '2027-07-01')::text),
('A8  span is 290 days, not 291',
 '290', (public.rpm_season_end(date '2026-08-14') - public.rpm_season_start(date '2026-08-14'))::text),

-- -----------------------------------------------------------------------------
-- B. Checkpoints
-- -----------------------------------------------------------------------------
('B1  exactly six checkpoints',
 '6', (select count(*)::text from public.rpm_season_checkpoints(date '2026-10-01'))),
('B2  checkpoint 1 = 1 Oct 2026',
 '2026-10-01', (select due_on::text from public.rpm_season_checkpoints(date '2026-10-01') where checkpoint_no = 1)),
('B3  checkpoint 2 = 19 Nov 2026',
 '2026-11-19', (select due_on::text from public.rpm_season_checkpoints(date '2026-10-01') where checkpoint_no = 2)),
('B4  checkpoint 3 = 6 Jan 2027',
 '2027-01-06', (select due_on::text from public.rpm_season_checkpoints(date '2026-10-01') where checkpoint_no = 3)),
('B5  checkpoint 4 = 23 Feb 2027',
 '2027-02-23', (select due_on::text from public.rpm_season_checkpoints(date '2026-10-01') where checkpoint_no = 4)),
('B6  checkpoint 5 = 13 Apr 2027',
 '2027-04-13', (select due_on::text from public.rpm_season_checkpoints(date '2026-10-01') where checkpoint_no = 5)),
('B7  checkpoint 6 lands exactly on 31 May',
 '2027-05-31', (select due_on::text from public.rpm_season_checkpoints(date '2026-10-01') where checkpoint_no = 6)),
('B8  checkpoints strictly increasing',
 '5', (select count(*)::text from (
         select due_on, lag(due_on) over (order by checkpoint_no) as prev
         from public.rpm_season_checkpoints(date '2026-10-01')) x
       where x.prev is not null and x.due_on > x.prev)),
('B9  windows within 1 day of each other',
 '1', (select (max(gap) - min(gap))::text from (
         select due_on - coalesce(lag(due_on) over (order by checkpoint_no),
                                  public.rpm_season_start(date '2026-10-01')) as gap
         from public.rpm_season_checkpoints(date '2026-10-01')) g)),
('B10 leap season still ends on 31 May',
 '2028-05-31', (select due_on::text from public.rpm_season_checkpoints(date '2028-01-01') where checkpoint_no = 6)),
('B11 leap season span is 291 days',
 '291', (public.rpm_season_end(date '2028-01-01') - public.rpm_season_start(date '2028-01-01'))::text),

-- -----------------------------------------------------------------------------
-- C. Tier 3 pacing.  Checkpoints: 1 Oct, 19 Nov, 6 Jan, 23 Feb, 13 Apr, 31 May
--    Args: (season_count, binding_total, binding_due, next_due_at, as_of, off_season)
-- -----------------------------------------------------------------------------
('C1  day 10 of season, nothing logged yet',
 'green',  public.rpm_tier3_status(0, 6, 0, date '2026-10-01', date '2026-08-24', false)),
('C2  11 days before first checkpoint',
 'amber',  public.rpm_tier3_status(0, 6, 0, date '2026-10-01', date '2026-09-20', false)),
('C3  first checkpoint reached with nothing logged',
 'red',    public.rpm_tier3_status(0, 6, 1, date '2026-10-01', date '2026-10-01', false)),
('C4  logging on the checkpoint date clears it same day',
 'green',  public.rpm_tier3_status(1, 6, 1, date '2026-11-19', date '2026-10-01', false)),
('C5  9 days before second checkpoint',
 'amber',  public.rpm_tier3_status(1, 6, 1, date '2026-11-19', date '2026-11-10', false)),
('C6  REGRESSION: 3 of 6 on 20 May must be red, not amber',
 'red',    public.rpm_tier3_status(3, 6, 5, date '2027-02-23', date '2027-05-20', false)),
('C7  5 of 6 on the final day is red, never silently passes',
 'red',    public.rpm_tier3_status(5, 6, 6, date '2027-05-31', date '2027-05-31', false)),
('C8  6 of 6 on the final day is complete',
 'complete', public.rpm_tier3_status(6, 6, 6, null, date '2027-05-31', false)),
('C9  front-loaded 6 by November is complete, not penalised',
 'complete', public.rpm_tier3_status(6, 6, 1, null, date '2026-11-15', false)),
('C10 ahead of pace stays green',
 'green',  public.rpm_tier3_status(3, 6, 1, date '2027-02-23', date '2026-11-20', false)),
('C11 off season shows off season, not red',
 'off_season', public.rpm_tier3_status(5, 6, 6, null, date '2027-06-15', true)),
('C12 assigned after the last checkpoint means no obligation',
 'not_required', public.rpm_tier3_status(0, 0, 0, null, date '2027-05-25', false)),
('C13 mid-season Tier 3, pro-rated to 3 checkpoints, behind',
 'red',    public.rpm_tier3_status(0, 3, 1, date '2027-04-13', date '2027-03-01', false)),
('C14 mid-season Tier 3, pro-rated to 3 checkpoints, on pace',
 'green',  public.rpm_tier3_status(1, 3, 1, date '2027-04-13', date '2027-03-01', false)),

-- -----------------------------------------------------------------------------
-- D. Tier 1 / Tier 2 recency — existing behaviour, must not change
-- -----------------------------------------------------------------------------
('D1  no qualifying contact is Not enough data, not red',
 'no_data', public.rpm_recency_status(null, 15, date '2026-08-24', 3)),
('D2  Tier 1 well inside the 15-day interval',
 'green', public.rpm_recency_status(date '2026-08-20', 15, date '2026-08-24', 3)),
('D3  Tier 1 two days from expiry',
 'amber', public.rpm_recency_status(date '2026-08-20', 15, date '2026-09-02', 3)),
('D4  Tier 1 past the 15-day interval',
 'red',   public.rpm_recency_status(date '2026-08-20', 15, date '2026-09-05', 3)),
('D5  Tier 2 inside the 30-day interval',
 'green', public.rpm_recency_status(date '2026-08-01', 30, date '2026-08-20', 7)),
('D6  Tier 2 seven days from expiry',
 'amber', public.rpm_recency_status(date '2026-08-01', 30, date '2026-08-24', 7)),
('D7  Tier 2 past the 30-day interval',
 'red',   public.rpm_recency_status(date '2026-08-01', 30, date '2026-09-05', 7))

)
select test,
       expected,
       actual,
       case when expected = actual then 'PASS' else 'FAIL' end as result
from t
order by test;


-- =============================================================================
-- GROUP E · Canonical linkage
--
-- E1 and E2 are structural and must always pass. E3 and E4 assert against live
-- data: E3 is the 17 report-created Live Match Observations the current
-- slug-keyed engine cannot see, and E4 confirms nothing is lost between the
-- raw data and the read model.
-- =============================================================================

select 'E1  read model never references gk_slug' as test,
       case when position('gk_slug' in
              pg_get_functiondef('public.duty_of_care_at(date)'::regprocedure)) = 0
            then 'PASS' else 'FAIL' end as result
union all
select 'E2  read model never references goalkeeper_name',
       case when position('goalkeeper_name' in
              pg_get_functiondef('public.duty_of_care_at(date)'::regprocedure)) = 0
            then 'PASS' else 'FAIL' end
union all
select 'E3  slug-less linked interactions are counted (expect > 0)',
       case when (
         select count(*) from public.interactions i
         join public.interaction_types t
           on t.name = i.interaction_type and t.counts_as_live
         where i.deleted_at is null
           and i.player_id is not null
           and coalesce(btrim(i.gk_slug), '') = ''
           and i.occurred_at between public.rpm_season_start(current_date) and current_date
       ) > 0 then 'PASS' else 'FAIL — check match-report linkage' end
union all
select 'E4  read model total matches raw qualifying total',
       case when (
         select coalesce(sum(season_count), 0) from public.player_duty_of_care
       ) = (
         select count(*) from public.interactions i
         join public.interaction_types t
           on t.name = i.interaction_type and t.counts_as_live
         join public.players p
           on p.id = i.player_id and p.deleted_at is null
         where i.deleted_at is null
           and i.occurred_at between
               greatest(public.rpm_season_start(current_date),
                        coalesce(p.tier_effective_from, public.rpm_season_start(current_date)))
               and current_date
       ) then 'PASS' else 'FAIL — reconcile before shipping' end;


-- =============================================================================
-- GROUP F · Wiring and security
-- =============================================================================

select 'F1  view does not bypass RLS' as test,
       case when coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=on%'
            then 'PASS' else 'FAIL — STOP, view would expose all players' end as result
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'player_duty_of_care'
union all
select 'F2  one row per active player',
       case when (select count(*) from public.player_duty_of_care)
               = (select count(*) from public.players where deleted_at is null)
            then 'PASS' else 'FAIL' end
union all
select 'F3  no null status anywhere',
       case when (select count(*) from public.player_duty_of_care
                  where rag_status is null or status_label is null) = 0
            then 'PASS' else 'FAIL' end
union all
select 'F4  qualifying set matches schema.ts (3 types, Phone Call excluded)',
       case when (select count(*) from public.interaction_types where counts_as_live) = 3
             and (select counts_as_live from public.interaction_types where name = 'Phone Call') = false
            then 'PASS' else 'FAIL' end
union all
select 'F5  tier_effective_from column present',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'players'
           and column_name = 'tier_effective_from')
            then 'PASS' else 'FAIL — run 01 first' end;


-- =============================================================================
-- EYEBALL · Not assertions. Review these with RPM before cutover.
-- =============================================================================

-- Current Tier 3 board, sorted by urgency. This is what the dashboard will show.
select full_name, current_club, season_count, period_target,
       checkpoints_due, next_checkpoint_no, next_due_at, days_until_due, status_label
from public.player_duty_of_care
where tier = 'Tier 3'
order by next_due_at nulls last, full_name;

-- How the whole book looks today, by tier.
select coalesce(tier, '(null)') as tier, status_label, rag_status, count(*) as players
from public.player_duty_of_care
group by 1, 2, 3
order by 1, 2;

-- Walk one Tier 3 player through the whole season. Swap in a real player_id.
-- Confirms the status transitions green -> amber -> red at the checkpoint dates.
-- select d.as_of, d.season_count, d.checkpoints_due, d.next_due_at, d.status_label
-- from generate_series(date '2026-08-14', date '2027-06-30', interval '1 week') g(as_of)
-- cross join lateral public.duty_of_care_at(g.as_of::date) d
-- where d.player_id = '<paste a Tier 3 player_id>'
-- order by d.as_of;

-- Performance. Expect single-digit milliseconds at current volumes.
explain analyze select * from public.player_duty_of_care;
