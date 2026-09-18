-- Duty-of-care reset ledger.
--
-- The goalkeeper profile already inserts into public.duty_of_care_resets and
-- the app comments that duty_of_care_at() folds those rows into its recency
-- clock. Neither the table nor that fold existed: a reset either failed on
-- insert or wrote a row the badge never read.
--
-- Forward-only. Apply deliberately; do not use supabase db push against
-- production.

CREATE TABLE IF NOT EXISTS public.duty_of_care_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  reset_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  CONSTRAINT duty_of_care_resets_reason_len
    CHECK (char_length(reason) <= 500),
  CONSTRAINT duty_of_care_resets_created_by_name_len
    CHECK (char_length(created_by_name) <= 160)
);

COMMENT ON TABLE public.duty_of_care_resets IS
  'Append-only restarts of a goalkeeper''s duty-of-care recency clock. Logged interactions are not changed; duty_of_care_at() treats reset_at as last_interaction_at.';
COMMENT ON COLUMN public.duty_of_care_resets.reset_at IS
  'Database clock at which the recency window restarts. Left to now() so callers cannot supply their own time.';
COMMENT ON COLUMN public.duty_of_care_resets.created_by_name IS
  'Display snapshot retained if the originating account is later removed.';

CREATE INDEX IF NOT EXISTS duty_of_care_resets_player_reset_at_idx
  ON public.duty_of_care_resets (player_id, reset_at DESC);

ALTER TABLE public.duty_of_care_resets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duty_of_care_resets_select_authorised
  ON public.duty_of_care_resets;
CREATE POLICY duty_of_care_resets_select_authorised
  ON public.duty_of_care_resets
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS duty_of_care_resets_insert_managers
  ON public.duty_of_care_resets;
CREATE POLICY duty_of_care_resets_insert_managers
  ON public.duty_of_care_resets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND (
      public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
      OR public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    )
  );

REVOKE ALL ON TABLE public.duty_of_care_resets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.duty_of_care_resets TO authenticated;
GRANT SELECT, INSERT ON TABLE public.duty_of_care_resets TO service_role;

-- Fold reset rows into last_interaction_at so a recorded reset restarts the
-- Tier 1 / Tier 2 recency clock. Season interaction counts are unchanged.
CREATE OR REPLACE FUNCTION public.duty_of_care_at(as_of date)
RETURNS TABLE (
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
LANGUAGE sql STABLE SET search_path = '' AS $fn$
WITH cfg AS (
  SELECT
    public.rpm_season_start(as_of) AS season_start,
    public.rpm_season_end(as_of)   AS season_end,
    14                             AS tier3_amber_lead
),
-- Verified against src/lib/mock-data.ts:609-614 on 2026-08-24. The frontend
-- rule is `days > floor(interval * 0.75)`, so amber_lead encodes
-- interval - floor(interval * 0.75) - 1. Tier 1: 15 - 11 - 1 = 3.
-- Tier 2: 30 - 22 - 1 = 7. Do not refactor to the formula.
tier_cfg (tier_key, interval_days, amber_lead_days) AS (
  VALUES ('tier 1'::text, 15, 3),
         ('tier 2'::text, 30, 7)
),
qualifying AS (
  SELECT i.player_id, i.occurred_at
  FROM public.interactions i
  JOIN public.interaction_types t
    ON t.name = i.interaction_type
   AND t.counts_as_live
  WHERE i.deleted_at IS NULL
    AND i.player_id IS NOT NULL
    AND i.occurred_at <= as_of
),
last_any AS (
  SELECT clock.player_id, max(clock.occurred_at) AS last_interaction_at
  FROM (
    SELECT q.player_id, q.occurred_at
    FROM qualifying q
    UNION ALL
    SELECT r.player_id, (r.reset_at AT TIME ZONE 'utc')::date AS occurred_at
    FROM public.duty_of_care_resets r
    WHERE (r.reset_at AT TIME ZONE 'utc')::date <= as_of
  ) clock
  GROUP BY clock.player_id
),
pb AS (
  SELECT
    pl.id AS player_id, pl.full_name, pl.current_club, pl.tier,
    lower(coalesce(nullif(btrim(pl.tier), ''), 'unassigned')) AS tier_key,
    pl.tier_effective_from,
    greatest(c.season_start, coalesce(pl.tier_effective_from, c.season_start)) AS effective_start,
    c.season_start, c.season_end, c.tier3_amber_lead,
    (as_of > c.season_end) AS is_off_season
  FROM public.players pl
  CROSS JOIN cfg c
  WHERE pl.deleted_at IS NULL
),
season_agg AS (
  SELECT pb.player_id, count(q.player_id)::integer AS season_count
  FROM pb
  LEFT JOIN qualifying q
    ON q.player_id     = pb.player_id
   AND q.occurred_at  >= pb.effective_start
   AND q.occurred_at  <= least(as_of, pb.season_end)
  GROUP BY pb.player_id
),
bind AS (
  SELECT pb.player_id, cp.due_on,
         row_number() OVER (PARTITION BY pb.player_id ORDER BY cp.due_on)::integer AS rn
  FROM pb
  CROSS JOIN public.rpm_season_checkpoints(as_of, 6) cp
  WHERE cp.due_on >= pb.effective_start
),
bind_agg AS (
  SELECT b.player_id,
         count(*)::integer                                  AS binding_total,
         count(*) FILTER (WHERE b.due_on <= as_of)::integer  AS binding_due
  FROM bind b GROUP BY b.player_id
),
resolved AS (
  SELECT
    pb.*,
    tc.interval_days,
    tc.amber_lead_days,
    la.last_interaction_at,
    sa.season_count,
    coalesce(ba.binding_total, 0) AS binding_total,
    coalesce(ba.binding_due,   0) AS binding_due,
    nx.due_on                     AS next_due_at
  FROM pb
  JOIN      season_agg sa ON sa.player_id = pb.player_id
  LEFT JOIN tier_cfg   tc ON tc.tier_key  = pb.tier_key
  LEFT JOIN last_any   la ON la.player_id = pb.player_id
  LEFT JOIN bind_agg   ba ON ba.player_id = pb.player_id
  LEFT JOIN bind       nx ON nx.player_id = pb.player_id
                         AND nx.rn        = sa.season_count + 1
),
scored AS (
  SELECT r.*,
    CASE
      WHEN r.tier_key = 'tier 3' THEN
        public.rpm_tier3_status(
          r.season_count, r.binding_total, r.binding_due,
          r.next_due_at, as_of, r.is_off_season, r.tier3_amber_lead)
      WHEN r.interval_days IS NOT NULL THEN
        public.rpm_recency_status(
          r.last_interaction_at, r.interval_days, as_of, r.amber_lead_days)
      ELSE 'not_required'
    END AS state
  FROM resolved r
)
SELECT
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
  CASE WHEN s.tier_key = 'tier 3' THEN s.binding_total END                   AS period_target,
  CASE WHEN s.tier_key = 'tier 3' THEN s.binding_due   END                   AS checkpoints_due,
  CASE WHEN s.tier_key = 'tier 3' AND s.season_count < s.binding_total
       THEN s.season_count + 1 END                                           AS next_checkpoint_no,
  CASE WHEN s.tier_key = 'tier 3' THEN s.next_due_at END                     AS next_due_at,
  CASE WHEN s.tier_key = 'tier 3' THEN (s.next_due_at - as_of)::integer END   AS days_until_due,
  s.state,
  CASE s.state
    WHEN 'red'      THEN 'red'
    WHEN 'amber'    THEN 'amber'
    WHEN 'green'    THEN 'green'
    WHEN 'complete' THEN 'green'
    ELSE 'none'
  END AS rag_status,
  CASE s.state
    WHEN 'off_season'    THEN 'Off season'
    WHEN 'not_required'  THEN 'Not required'
    WHEN 'no_data'       THEN 'Not enough data'
    WHEN 'complete'      THEN 'Complete'
    WHEN 'red'           THEN 'Overdue'
    WHEN 'amber'         THEN 'Due soon'
    ELSE 'Up to date'
  END AS status_label,
  CASE
    WHEN s.tier_key <> 'tier 3'                                       THEN NULL
    WHEN s.binding_total > 0 AND s.season_count >= s.binding_total    THEN 'met'
    WHEN s.is_off_season                                              THEN 'not_met'
    ELSE NULL
  END AS season_outcome
FROM scored s;
$fn$;

COMMENT ON FUNCTION public.duty_of_care_at(date) IS
  'Duty of care read model as at a given date. Tier 1: 15-day recency. Tier 2: 30-day recency. Tier 3: six fixed cumulative checkpoints across the RPM season (14 Aug - 31 May), pro-rated by players.tier_effective_from. Tier 4 and unassigned: not required. Qualifying types come from public.interaction_types; interactions are keyed on player_id only. A duty_of_care_resets row restarts the recency clock by counting as last_interaction_at without altering logged interactions.';
