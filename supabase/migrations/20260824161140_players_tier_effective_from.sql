-- =============================================================================
-- players.tier_effective_from
-- Tier 3 duty of care is measured against fixed seasonal checkpoints. A player
-- moved to Tier 3 in February cannot fairly be judged against checkpoints that
-- fell in October. This adds the tier-effective date needed to pro-rate that.
-- No backfill: NULL reads as "at this tier since the season began", which is
-- correct for all existing rows.
-- =============================================================================

alter table public.players
  add column if not exists tier_effective_from date;

comment on column public.players.tier_effective_from is
  'Date the player''s current tier took effect. NULL means "since the start of the current season". Used to pro-rate Tier 3 seasonal checkpoints for mid-season reassignments. Maintained automatically by trigger players_tier_effective_from_trg.';

-- Stamp the effective date whenever tier changes. An explicit value supplied by
-- the caller always wins, so a correction to a mis-typed tier can preserve the
-- original date by setting both columns in the same UPDATE.
create or replace function public.players_set_tier_effective_from()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.tier is not null and new.tier_effective_from is null then
      new.tier_effective_from := current_date;
    end if;
  elsif new.tier is distinct from old.tier
    and new.tier_effective_from is not distinct from old.tier_effective_from then
    new.tier_effective_from := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists players_tier_effective_from_trg on public.players;

create trigger players_tier_effective_from_trg
  before insert or update of tier, tier_effective_from on public.players
  for each row
  execute function public.players_set_tier_effective_from();
