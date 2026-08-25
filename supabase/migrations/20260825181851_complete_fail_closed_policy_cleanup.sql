-- Remove the final overlapping-policy advisor warning while keeping the lookup
-- readable to every provisioned RPM role and mutable only by Super Admins.

DROP POLICY IF EXISTS "Authenticated can read interaction types"
  ON public.interaction_types;
DROP POLICY IF EXISTS "Super admins manage interaction types"
  ON public.interaction_types;
DROP POLICY IF EXISTS interaction_types_select_operational
  ON public.interaction_types;
DROP POLICY IF EXISTS interaction_types_insert_super_admin
  ON public.interaction_types;
DROP POLICY IF EXISTS interaction_types_update_super_admin
  ON public.interaction_types;
DROP POLICY IF EXISTS interaction_types_delete_super_admin
  ON public.interaction_types;

CREATE POLICY interaction_types_select_operational
  ON public.interaction_types
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  );

CREATE POLICY interaction_types_insert_super_admin
  ON public.interaction_types
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  );

CREATE POLICY interaction_types_update_super_admin
  ON public.interaction_types
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  );

CREATE POLICY interaction_types_delete_super_admin
  ON public.interaction_types
  FOR DELETE
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  );

REVOKE ALL PRIVILEGES ON TABLE public.interaction_types
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.interaction_types
  TO authenticated;

-- The cutover control table is server-only. Keep an explicit deny policy so
-- the intent is visible to schema tooling while its browser grants remain
-- fully revoked by the preceding migration.
DROP POLICY IF EXISTS match_report_cutover_state_read
  ON public.match_report_cutover_state;
DROP POLICY IF EXISTS match_report_cutover_state_no_client_access
  ON public.match_report_cutover_state;
CREATE POLICY match_report_cutover_state_no_client_access
  ON public.match_report_cutover_state
  FOR SELECT
  TO authenticated
  USING (false);
