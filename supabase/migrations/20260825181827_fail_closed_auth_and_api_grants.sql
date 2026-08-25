-- Forward-only hardening: RLS initplan efficiency + mentor directory caller guard.
-- Applies Supabase advisor fixes for auth_rls_initplan and list_mentor_directory exposure.

CREATE OR REPLACE FUNCTION public.list_mentor_directory()
RETURNS TABLE (id uuid, name text, is_manager boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'mentor'::app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::app_role)
    OR public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised to list the mentor directory'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.name, '') AS name,
    public.has_role(p.id, 'mentor_manager'::app_role) AS is_manager
  FROM public.profiles p
  WHERE public.has_role(p.id, 'mentor'::app_role)
     OR public.has_role(p.id, 'mentor_manager'::app_role)
  ORDER BY COALESCE(p.name, '');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_mentor_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_mentor_directory() TO authenticated;

-- calendar_event_audit.calendar_event_audit_select_scoped
DROP POLICY IF EXISTS "calendar_event_audit_select_scoped" ON public."calendar_event_audit";
CREATE POLICY "calendar_event_audit_select_scoped" ON public."calendar_event_audit"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM calendar_events e
  WHERE ((e.id = calendar_event_audit.calendar_event_id) AND (e.assigned_mentor_id = (select auth.uid())))))));

-- calendar_events.calendar_events_delete_managers
DROP POLICY IF EXISTS "calendar_events_delete_managers" ON public."calendar_events";
CREATE POLICY "calendar_events_delete_managers" ON public."calendar_events"
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- calendar_events.calendar_events_insert_managers
DROP POLICY IF EXISTS "calendar_events_insert_managers" ON public."calendar_events";
CREATE POLICY "calendar_events_insert_managers" ON public."calendar_events"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((created_by = (select auth.uid())) AND (has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))));

-- calendar_events.calendar_events_select_authorised
DROP POLICY IF EXISTS "calendar_events_select_authorised" ON public."calendar_events";
CREATE POLICY "calendar_events_select_authorised" ON public."calendar_events"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- calendar_events.calendar_events_update_managers
DROP POLICY IF EXISTS "calendar_events_update_managers" ON public."calendar_events";
CREATE POLICY "calendar_events_update_managers" ON public."calendar_events"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- dashboard_click_events.Users can insert their own click events
DROP POLICY IF EXISTS "Users can insert their own click events" ON public."dashboard_click_events";
CREATE POLICY "Users can insert their own click events" ON public."dashboard_click_events"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((select auth.uid()) = user_id));

-- dashboard_click_events.Users can view their own click events
DROP POLICY IF EXISTS "Users can view their own click events" ON public."dashboard_click_events";
CREATE POLICY "Users can view their own click events" ON public."dashboard_click_events"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((((select auth.uid()) = user_id) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- install_prompt_events.Users can insert their own install events
DROP POLICY IF EXISTS "Users can insert their own install events" ON public."install_prompt_events";
CREATE POLICY "Users can insert their own install events" ON public."install_prompt_events"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((user_id IS NULL) OR ((select auth.uid()) = user_id)));

-- install_prompt_events.Users can view their own install events
DROP POLICY IF EXISTS "Users can view their own install events" ON public."install_prompt_events";
CREATE POLICY "Users can view their own install events" ON public."install_prompt_events"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((((select auth.uid()) = user_id) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- interaction_audit.interaction_audit_select_scoped
DROP POLICY IF EXISTS "interaction_audit_select_scoped" ON public."interaction_audit";
CREATE POLICY "interaction_audit_select_scoped" ON public."interaction_audit"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role) OR (EXISTS ( SELECT 1
   FROM interactions i
  WHERE ((i.id = interaction_audit.interaction_id) AND (i.mentor_id = (select auth.uid())))))));

-- interaction_media.interaction_media_insert_authorised
DROP POLICY IF EXISTS "interaction_media_insert_authorised" ON public."interaction_media";
CREATE POLICY "interaction_media_insert_authorised" ON public."interaction_media"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((attached_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM interactions i
  WHERE ((i.id = interaction_media.interaction_id) AND (i.deleted_at IS NULL) AND ((i.mentor_id = (select auth.uid())) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))))) AND (EXISTS ( SELECT 1
   FROM media_assets m
  WHERE (m.id = interaction_media.media_id)))));

-- interactions.interactions_insert_own
DROP POLICY IF EXISTS "interactions_insert_own" ON public."interactions";
CREATE POLICY "interactions_insert_own" ON public."interactions"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((mentor_id = (select auth.uid())) AND (has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))));

-- interactions.interactions_select_privileged
DROP POLICY IF EXISTS "interactions_select_privileged" ON public."interactions";
CREATE POLICY "interactions_select_privileged" ON public."interactions"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((((deleted_at IS NULL) AND (has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- interactions.interactions_update_authorised
DROP POLICY IF EXISTS "interactions_update_authorised" ON public."interactions";
CREATE POLICY "interactions_update_authorised" ON public."interactions"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING ((((mentor_id = (select auth.uid())) AND (has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)))
  WITH CHECK ((((mentor_id = (select auth.uid())) AND (has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- match_report_submissions.match_report_submissions_insert_own
DROP POLICY IF EXISTS "match_report_submissions_insert_own" ON public."match_report_submissions";
CREATE POLICY "match_report_submissions_insert_own" ON public."match_report_submissions"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((select auth.uid()) = user_id));

-- match_report_submissions.match_report_submissions_select_scoped
DROP POLICY IF EXISTS "match_report_submissions_select_scoped" ON public."match_report_submissions";
CREATE POLICY "match_report_submissions_select_scoped" ON public."match_report_submissions"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((((select auth.uid()) = user_id) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- match_reports_cache.match_reports_cache_select_privileged
DROP POLICY IF EXISTS "match_reports_cache_select_privileged" ON public."match_reports_cache";
CREATE POLICY "match_reports_cache_select_privileged" ON public."match_reports_cache"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- media_assets.media_assets_delete_privileged
DROP POLICY IF EXISTS "media_assets_delete_privileged" ON public."media_assets";
CREATE POLICY "media_assets_delete_privileged" ON public."media_assets"
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role)));

-- media_assets.media_assets_insert_scoped
DROP POLICY IF EXISTS "media_assets_insert_scoped" ON public."media_assets";
CREATE POLICY "media_assets_insert_scoped" ON public."media_assets"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((uploaded_by_id = ((select auth.uid()))::text) AND (has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))));

-- media_assets.media_assets_select_scoped
DROP POLICY IF EXISTS "media_assets_select_scoped" ON public."media_assets";
CREATE POLICY "media_assets_select_scoped" ON public."media_assets"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((uploaded_by_id = ((select auth.uid()))::text) OR has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- media_assets.media_assets_update_scoped
DROP POLICY IF EXISTS "media_assets_update_scoped" ON public."media_assets";
CREATE POLICY "media_assets_update_scoped" ON public."media_assets"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (((uploaded_by_id = ((select auth.uid()))::text) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)))
  WITH CHECK (((uploaded_by_id = ((select auth.uid()))::text) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- media_audit_log.media_audit_insert_own_actor
DROP POLICY IF EXISTS "media_audit_insert_own_actor" ON public."media_audit_log";
CREATE POLICY "media_audit_insert_own_actor" ON public."media_audit_log"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((actor_id = ((select auth.uid()))::text));

-- media_audit_log.media_audit_select_privileged
DROP POLICY IF EXISTS "media_audit_select_privileged" ON public."media_audit_log";
CREATE POLICY "media_audit_select_privileged" ON public."media_audit_log"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role)));

-- notifications.notifications_insert_authorised
DROP POLICY IF EXISTS "notifications_insert_authorised" ON public."notifications";
CREATE POLICY "notifications_insert_authorised" ON public."notifications"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((recipient_id = (select auth.uid())) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- notifications.notifications_select_own
DROP POLICY IF EXISTS "notifications_select_own" ON public."notifications";
CREATE POLICY "notifications_select_own" ON public."notifications"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((recipient_id = (select auth.uid())));

-- notifications.notifications_update_own
DROP POLICY IF EXISTS "notifications_update_own" ON public."notifications";
CREATE POLICY "notifications_update_own" ON public."notifications"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING ((recipient_id = (select auth.uid())))
  WITH CHECK ((recipient_id = (select auth.uid())));

-- password_change_audit.Super admins can view password audit
DROP POLICY IF EXISTS "Super admins can view password audit" ON public."password_change_audit";
CREATE POLICY "Super admins can view password audit" ON public."password_change_audit"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'super_admin'::app_role));

-- players.Authenticated can read players
DROP POLICY IF EXISTS "Authenticated can read players" ON public."players";
CREATE POLICY "Authenticated can read players" ON public."players"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((deleted_at IS NULL) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- players.Super admins manage players
DROP POLICY IF EXISTS "Super admins manage players" ON public."players";
CREATE POLICY "Super admins manage players" ON public."players"
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role((select auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'super_admin'::app_role));

-- players.players_update_club_authorised
DROP POLICY IF EXISTS "players_update_club_authorised" ON public."players";
CREATE POLICY "players_update_club_authorised" ON public."players"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- profiles.profiles_select_own_or_privileged
DROP POLICY IF EXISTS "profiles_select_own_or_privileged" ON public."profiles";
CREATE POLICY "profiles_select_own_or_privileged" ON public."profiles"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((((select auth.uid()) = id) OR has_role((select auth.uid()), 'super_admin'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role)));

-- profiles.profiles_update_own
DROP POLICY IF EXISTS "profiles_update_own" ON public."profiles";
CREATE POLICY "profiles_update_own" ON public."profiles"
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (((select auth.uid()) = id))
  WITH CHECK (((select auth.uid()) = id));

-- purged_demo_records.purged_demo_records_select_super_admin
DROP POLICY IF EXISTS "purged_demo_records_select_super_admin" ON public."purged_demo_records";
CREATE POLICY "purged_demo_records_select_super_admin" ON public."purged_demo_records"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'super_admin'::app_role));

-- report_attachments.report_attachments_delete_scoped
DROP POLICY IF EXISTS "report_attachments_delete_scoped" ON public."report_attachments";
CREATE POLICY "report_attachments_delete_scoped" ON public."report_attachments"
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (((attached_by_id = ((select auth.uid()))::text) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- report_attachments.report_attachments_insert_scoped
DROP POLICY IF EXISTS "report_attachments_insert_scoped" ON public."report_attachments";
CREATE POLICY "report_attachments_insert_scoped" ON public."report_attachments"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((attached_by_id = ((select auth.uid()))::text) AND (has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role))));

-- report_attachments.report_attachments_select_scoped
DROP POLICY IF EXISTS "report_attachments_select_scoped" ON public."report_attachments";
CREATE POLICY "report_attachments_select_scoped" ON public."report_attachments"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role((select auth.uid()), 'mentor'::app_role) OR has_role((select auth.uid()), 'mentor_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'super_admin'::app_role)));

-- user_deletion_audit.Super admins can view deletion audit
DROP POLICY IF EXISTS "Super admins can view deletion audit" ON public."user_deletion_audit";
CREATE POLICY "Super admins can view deletion audit" ON public."user_deletion_audit"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role((select auth.uid()), 'super_admin'::app_role));

-- user_roles.user_roles_select_own
DROP POLICY IF EXISTS "user_roles_select_own" ON public."user_roles";
CREATE POLICY "user_roles_select_own" ON public."user_roles"
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((select auth.uid()) = user_id));

-- ---------------------------------------------------------------------------
-- Fail closed for newly-created and unprovisioned Auth accounts.
--
-- Auth creates only the companion profile. An RPM role is deliberately added
-- later by the Super Admin provisioning workflow; user-controlled metadata
-- must never grant a role or bind a mentor identity.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  user_email text := COALESCE(NEW.email, '');
  display_name text := COALESCE(
    NULLIF(btrim(meta->>'name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );
BEGIN
  INSERT INTO public.profiles (id, email, name, initials, title, mentor_id)
  VALUES (
    NEW.id,
    user_email,
    display_name,
    COALESCE(NULLIF(btrim(meta->>'initials'), ''), upper(left(display_name, 2))),
    COALESCE(meta->>'title', ''),
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- The roster is operational data. A valid JWT alone is insufficient: every
-- reader must hold an explicit RPM role. Super Admins keep visibility of
-- tombstones; other operational roles see active records only.
DROP POLICY IF EXISTS "Authenticated can read players" ON public.players;
DROP POLICY IF EXISTS "Super admins manage players" ON public.players;
DROP POLICY IF EXISTS players_select_operational ON public.players;
CREATE POLICY players_select_operational
  ON public.players
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    OR (
      deleted_at IS NULL
      AND (
        public.has_role((select auth.uid()), 'mentor'::public.app_role)
        OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
        OR public.has_role((select auth.uid()), 'admin'::public.app_role)
      )
    )
  );

-- `players_update_club_authorised` remains the one UPDATE policy. Its database
-- trigger limits Mentor Managers/Admins to current_club while Super Admins may
-- correct or tombstone the full record. Direct client hard deletion stays off.
REVOKE ALL PRIVILEGES ON TABLE public.players FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.players TO authenticated;

-- Submission-ledger mutations use the server-only service role. Browser users
-- need only the RLS-scoped read used for their own submission status.
REVOKE ALL PRIVILEGES ON TABLE public.match_report_submissions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.match_report_submissions TO authenticated;

-- This one-row migration/cutover control table has no product UI consumer.
-- Service-role maintenance bypasses RLS and retains its existing privileges.
DO $$
BEGIN
  IF to_regclass('public.match_report_cutover_state') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.match_report_cutover_state ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS match_report_cutover_state_read ON public.match_report_cutover_state';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.match_report_cutover_state FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

-- RLS does not protect TRUNCATE. Browser roles never need it. Anonymous clients
-- also never need physical row deletion. Start signed-in clients from no DELETE
-- privilege and grant back only the six reviewed product paths below. This is
-- deliberately explicit: several tables have `USING (false)` deny policies,
-- which must not be mistaken for an intentional delete path.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;

GRANT DELETE ON TABLE
  public.announcements,
  public.calendar_events,
  public.interaction_types,
  public.media_assets,
  public.report_attachments,
  public.support_threads
TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM PUBLIC, anon, authenticated;
