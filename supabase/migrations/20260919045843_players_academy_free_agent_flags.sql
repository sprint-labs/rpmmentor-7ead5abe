alter table public.players
  add column if not exists is_academy boolean not null default false,
  add column if not exists is_free_agent boolean not null default false;

comment on column public.players.is_academy is
  'Academy status. Independent of tier — an academy goalkeeper still holds a care-cadence tier.';
comment on column public.players.is_free_agent is
  'Free-agent status. Independent of tier, and independent of current_club.';

update public.players set is_academy = true where tier = 'Academy';
update public.players set is_free_agent = true where tier = 'Free Agent';

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

update public.players
set tier = 'Tier 4'
where deleted_at is null
  and full_name = 'Reece Byrne'
  and tier = 'Free Agent';

update public.players
set tier = 'Tier 1'
where deleted_at is null
  and full_name = 'Calum Ward'
  and tier is null;

update public.players set tier = null where tier in ('Academy', 'Free Agent');

alter table public.players drop constraint if exists players_tier_check;
alter table public.players
  add constraint players_tier_check
  check (tier is null or tier in ('Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'));

comment on column public.players.tier is
  'Care-cadence tier, or NULL when unassigned. Academy and Free Agent are separate boolean columns, not tiers.';