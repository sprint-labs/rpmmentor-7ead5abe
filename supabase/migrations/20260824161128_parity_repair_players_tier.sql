-- =============================================================================
-- PARITY REPAIR: players.tier
-- Restores to the repository the state applied live by ledger entry
-- 20260812145053_add_tier_column_to_players, which was never committed.
-- No-op against live; correct against a fresh environment.
-- Scope: this one documented gap only. Does NOT reconcile the four migrations
-- that exist in the repo under different timestamps -- per
-- docs/RPM-LIVE-OPERATING-GUIDE.md that drift is controlled.
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
