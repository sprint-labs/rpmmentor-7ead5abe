-- =============================================================================
-- Academy and Free Agent become their own attributes, not tiers
--
-- `players.tier` was one column carrying two different ideas: four care-cadence
-- tiers, and two statuses. A goalkeeper could therefore be Tier 1 or Academy
-- but never both — while in reality seven of them are exactly that. The tier
-- was the half that got lost, because 'Academy' is what the column ended up
-- holding.
--
-- Reconciled against the roster seed before writing this. For all seven academy
-- goalkeepers the seed's tier and the stored tier already AGREE, so nothing here
-- is in conflict: the flag simply had nowhere to live. The named list below is
-- spelled out rather than derived so the change is auditable line by line.
--
-- Reece Byrne is the one row where the tier was overwritten: he is stored as
-- 'Free Agent' and the seed records him as Tier 4. The owner confirmed both
-- restoring that tier and keeping the free-agent status, which is only now
-- expressible.
--
-- Calum Ward had lost his tier entirely — stored as NULL, recorded as Tier 1 in
-- the seed. The owner confirmed Tier 1, so it is restored here.
--
-- Deliberately NOT inferred: Alfie Smith and Daniel Barden keep no tier. Neither
-- appears in any seed, so there is no evidence to restore from; both surface as
-- Unassigned Tier for someone to assign.
--
-- `players_guard_club_only_update` is deliberately left alone: the new columns
-- stay Super-Admin-only, like every other column that is not club or tier.
-- =============================================================================

alter table public.players
  add column if not exists is_academy boolean not null default false,
  add column if not exists is_free_agent boolean not null default false;

comment on column public.players.is_academy is
  'Academy status. Independent of tier — an academy goalkeeper still holds a care-cadence tier.';
comment on column public.players.is_free_agent is
  'Free-agent status. Independent of tier, and independent of current_club.';

-- 1. Carry the two statuses the tier column was standing in for.
update public.players set is_academy = true where tier = 'Academy';
update public.players set is_free_agent = true where tier = 'Free Agent';

-- 2. Restore the academy flag for the goalkeepers whose tier survived. Their
--    tiers are not touched; only the flag that had nowhere to go is added.
update public.players
set is_academy = true
where deleted_at is null
  and full_name in (
    'Toby Bell',
    'Xander Grieves',
    'Blake Irow',
    'Jack Talbot',
    'Josh Bentley',
    'Cooper Covington',
    'Tom Streets'
  );

-- 3. Reece Byrne's tier was the value the status displaced. Restored, and
--    matched on the status rather than the name alone so this cannot touch a
--    namesake added later.
update public.players
set tier = 'Tier 4'
where deleted_at is null
  and full_name = 'Reece Byrne'
  and tier = 'Free Agent';

-- 4. Calum Ward's tier was missing rather than displaced. Restored, and guarded
--    on the row still being untiered so this cannot overwrite a later decision.
update public.players
set tier = 'Tier 1'
where deleted_at is null
  and full_name = 'Calum Ward'
  and tier is null;

-- 5. Anything still holding a status in the tier column has no tier evidence,
--    so it becomes explicitly unassigned rather than being guessed at.
update public.players set tier = null where tier in ('Academy', 'Free Agent');

-- 6. `tier` now means one thing only.
alter table public.players drop constraint if exists players_tier_check;
alter table public.players
  add constraint players_tier_check
  check (tier is null or tier in ('Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'));

comment on column public.players.tier is
  'Care-cadence tier, or NULL when unassigned. Academy and Free Agent are separate boolean columns, not tiers.';
