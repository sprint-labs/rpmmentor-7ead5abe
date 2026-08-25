-- =============================================================================
-- 01 — players.tier_effective_from
-- RPM Mentor Hub · Supabase project zdxxezquhvpjmoxlecjp
--
-- PREREQUISITE for 02. Run this first.
--
-- WHY
--   Tier 3 duty of care is measured against fixed seasonal checkpoints. A player
--   moved to Tier 3 in February cannot fairly be judged against checkpoints that
--   fell in October. There is currently no tier-effective date in the schema, so
--   this cannot be pro-rated. This adds one.
--
-- WHAT IT DOES
--   - Adds a nullable date column to public.players.
--   - Adds a trigger that stamps it whenever a player's tier changes.
--   - Does NOT backfill. NULL is read as "at this tier since the season began",
--     which is the correct interpretation for all 114 existing rows.
--
-- NOTE FOR REVIEW
--   This is the only file that touches an existing table or its write path.
--   Everything in 02 is purely additive. If you want to defer this, 02 will not
--   run without the column — see the note at the top of that file.
-- =============================================================================


alter table public.players
  add column if not exists tier_effective_from date;

comment on column public.players.tier_effective_from is
  'Date the player''s current tier took effect. NULL means "since the start of the current season". Used to pro-rate Tier 3 seasonal checkpoints for mid-season reassignments. Maintained automatically by trigger players_tier_effective_from_trg.';


-- -----------------------------------------------------------------------------
-- Trigger: stamp the effective date whenever tier changes.
--
-- An explicit value supplied by the caller always wins, so a correction to a
-- mis-typed tier can preserve the original date by setting both columns in the
-- same UPDATE.
-- -----------------------------------------------------------------------------

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
