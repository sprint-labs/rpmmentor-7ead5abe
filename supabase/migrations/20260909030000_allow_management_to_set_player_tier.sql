-- =============================================================================
-- Let Mentor Managers and Admins set players.tier
--
-- `players.tier` drives every duty-of-care obligation, but no role below Super
-- Admin could set it: `players_guard_club_only_update` rejected any UPDATE that
-- touched a column other than `current_club`. A roster imported without tiers
-- therefore had no in-app route to being tiered at all.
--
-- This widens that guard to `tier` and `tier_effective_from` and nothing else.
-- The set of roles permitted to update `public.players` is unchanged: the
-- `players_update_club_authorised` RLS policy still admits only Mentor Manager,
-- Admin and Super Admin, and every other column stays Super-Admin-only.
--
-- `tier_effective_from` is allowed alongside `tier` because
-- `players_tier_effective_from_trg` stamps it whenever the tier changes. Both
-- triggers are BEFORE UPDATE and fire in name order, so the guard below sees
-- the caller's values and the stamping trigger runs after it.
-- =============================================================================

create or replace function public.players_guard_club_only_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  -- Server-side jobs (service_role) and super admins keep full access.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF to_jsonb(NEW) - 'current_club' - 'tier' - 'tier_effective_from' - 'updated_at'
     IS DISTINCT FROM
     to_jsonb(OLD) - 'current_club' - 'tier' - 'tier_effective_from' - 'updated_at' THEN
    RAISE EXCEPTION 'Only current_club and tier may be updated by this role';
  END IF;

  RETURN NEW;
END;
$$;

revoke execute on function public.players_guard_club_only_update() from public, anon, authenticated;

comment on function public.players_guard_club_only_update() is
  'Column-level guard for the players_update_club_authorised UPDATE policy. Roles below Super Admin may change only current_club, tier and tier_effective_from; every other column is rejected.';
