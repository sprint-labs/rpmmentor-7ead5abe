-- =============================================================================
-- 00 — PARITY REPAIR: players.tier
-- RPM Mentor Hub · Supabase project zdxxezquhvpjmoxlecjp
--
-- WHY THIS EXISTS
--   The live database has `players.tier` and a `players_tier_check` constraint,
--   applied by ledger entry 20260812145053_add_tier_column_to_players. That
--   migration was never committed to the repository, so a fresh environment
--   built from `supabase/migrations/` would have no tier column at all — and
--   nothing downstream of it would work.
--
--   This file restores that state to the repo. It is written to be a NO-OP
--   against the live database, where the column and constraint already exist.
--
-- ORIGINAL STATEMENT (from the live ledger, verbatim)
--   ALTER TABLE public.players
--   ADD COLUMN tier text CHECK (tier IN
--     ('Tier 1','Tier 2','Tier 3','Tier 4','Academy','Free Agent'));
--
-- SCOPE
--   This repairs ONE documented gap. It does NOT attempt to reconcile the four
--   migrations that exist in the repo under different timestamps to the live
--   ledger — per docs/RPM-LIVE-OPERATING-GUIDE.md, that drift is controlled and
--   must not be resolved by replaying repository migrations.
--
-- RUN ORDER
--   Before 01_players_tier_effective_from.sql.
-- =============================================================================

alter table public.players
  add column if not exists tier text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.players'::regclass
      and conname  = 'players_tier_check'
  ) then
    alter table public.players
      add constraint players_tier_check
      check (tier in ('Tier 1','Tier 2','Tier 3','Tier 4','Academy','Free Agent'));
  end if;
end
$$;

comment on column public.players.tier is
  'Client service tier. Drives duty of care obligations: Tier 1 and Tier 2 use rolling recency intervals, Tier 3 uses six fixed seasonal checkpoints, Tier 4 / Academy / Free Agent carry no formal requirement.';
