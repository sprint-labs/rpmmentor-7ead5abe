-- profiles: only own-row SELECT/UPDATE for authenticated. No client INSERT/DELETE.
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Explicit deny-by-default: no INSERT/DELETE policies exist, so add none.
-- Row creation is handled by the SECURITY DEFINER trigger handle_new_user().

-- user_roles: read-own only. All role mutations must go through service_role.
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Belt-and-braces: explicitly reject any client-side write to user_roles even
-- if a grant is ever re-added by accident.
CREATE POLICY user_roles_no_client_insert
  ON public.user_roles FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY user_roles_no_client_update
  ON public.user_roles FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY user_roles_no_client_delete
  ON public.user_roles FOR DELETE TO authenticated, anon
  USING (false);

-- Same guarantee for profile row creation/removal.
CREATE POLICY profiles_no_client_insert
  ON public.profiles FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY profiles_no_client_delete
  ON public.profiles FOR DELETE TO authenticated, anon
  USING (false);
