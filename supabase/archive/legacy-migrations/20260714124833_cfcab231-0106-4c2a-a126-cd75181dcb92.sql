
-- 1. app_role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'mentor_manager', 'mentor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  initials text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  mentor_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4. has_role function (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 5. Auto-provision profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (id, email, name, initials, title, mentor_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(meta->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(meta->>'initials', upper(substring(COALESCE(meta->>'name', NEW.email) from 1 for 2))),
    COALESCE(meta->>'title', ''),
    meta->>'mentor_id'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'mentor')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Lock down media_assets
DROP POLICY IF EXISTS "media_assets_delete_all" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_insert_all" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_select_all" ON public.media_assets;
DROP POLICY IF EXISTS "media_assets_update_all" ON public.media_assets;

CREATE POLICY "media_assets_select_authenticated" ON public.media_assets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "media_assets_insert_authenticated" ON public.media_assets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "media_assets_update_authenticated" ON public.media_assets
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "media_assets_delete_privileged" ON public.media_assets
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'mentor_manager')
  );

-- 7. Lock down media_audit_log
DROP POLICY IF EXISTS "media_audit_insert" ON public.media_audit_log;
DROP POLICY IF EXISTS "media_audit_select" ON public.media_audit_log;

CREATE POLICY "media_audit_select_privileged" ON public.media_audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'mentor_manager')
  );

CREATE POLICY "media_audit_insert_authenticated" ON public.media_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 8. Lock down report_attachments
DROP POLICY IF EXISTS "report_attachments_delete" ON public.report_attachments;
DROP POLICY IF EXISTS "report_attachments_insert" ON public.report_attachments;
DROP POLICY IF EXISTS "report_attachments_select" ON public.report_attachments;

CREATE POLICY "report_attachments_select_authenticated" ON public.report_attachments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "report_attachments_insert_authenticated" ON public.report_attachments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "report_attachments_delete_authenticated" ON public.report_attachments
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 9. Lock down gk-media storage bucket
DROP POLICY IF EXISTS "gk_media_read_all" ON storage.objects;
DROP POLICY IF EXISTS "gk_media_insert_all" ON storage.objects;
DROP POLICY IF EXISTS "gk_media_update_all" ON storage.objects;
DROP POLICY IF EXISTS "gk_media_delete_all" ON storage.objects;
DROP POLICY IF EXISTS "gk_media_select" ON storage.objects;
DROP POLICY IF EXISTS "gk_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "gk_media_update" ON storage.objects;
DROP POLICY IF EXISTS "gk_media_delete" ON storage.objects;

CREATE POLICY "gk_media_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'gk-media');

CREATE POLICY "gk_media_insert_authenticated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gk-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "gk_media_update_authenticated" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'gk-media' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'gk-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "gk_media_delete_privileged" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gk-media' AND (
      auth.uid() = owner
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'mentor_manager')
    )
  );
