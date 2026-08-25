
-- 1. Restrict profiles SELECT to own row (or privileged roles)
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own_or_privileged
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'mentor_manager'::public.app_role)
  );

-- 2. Remove the anon-readable storage policy on gk-media
DROP POLICY IF EXISTS gk_media_read ON storage.objects;

-- 3. Revoke execute on SECURITY DEFINER functions from public/anon
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
-- has_role must remain callable by authenticated: RLS policies reference it
-- and require the invoking session to have EXECUTE.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
