-- Let management add goalkeepers from the app's Add Goalkeeper form.
--
-- Until now public.players had no INSERT grant or policy for `authenticated`,
-- so the form could not save and new goalkeepers had to be added by hand in
-- the database. Mirrors PLAYER_CREATE_ROLES in src/lib/roles.server.ts and the
-- goalkeepers.create permission in src/lib/auth.tsx; change all three together.
--
-- Mentors still cannot add goalkeepers. A new row cannot arrive already
-- soft-deleted.
grant insert on table public.players to authenticated;

drop policy if exists players_insert_management on public.players;
create policy players_insert_management
  on public.players
  for insert
  to authenticated
  with check (
    (
      public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
      or public.has_role((select auth.uid()), 'admin'::public.app_role)
      or public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    )
    and deleted_at is null
    and deleted_by is null
  );
