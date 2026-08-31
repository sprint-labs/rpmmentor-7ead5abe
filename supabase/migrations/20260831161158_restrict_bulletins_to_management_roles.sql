-- Restrict the operational Bulletin Board to Mentor Managers, Admins and
-- Super Admins. Existing mentor-authored and mentor-owned rows are retained so
-- management keeps the operational history, but Mentors can no longer read or
-- write Bulletin Board data through the Supabase Data API.

DROP POLICY IF EXISTS bulletin_items_select_scoped ON public.bulletin_items;
CREATE POLICY bulletin_items_select_scoped
  ON public.bulletin_items
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'mentor_manager'::app_role)
    OR public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS bulletin_items_insert_operational ON public.bulletin_items;
CREATE POLICY bulletin_items_insert_operational
  ON public.bulletin_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND (
      public.has_role((select auth.uid()), 'mentor_manager'::app_role)
      OR public.has_role((select auth.uid()), 'admin'::app_role)
      OR public.has_role((select auth.uid()), 'super_admin'::app_role)
    )
    AND (
      owner_id IS NULL
      OR rpm_private.bulletin_owner_is_operational(owner_id)
    )
  );

DROP POLICY IF EXISTS bulletin_updates_select_scoped ON public.bulletin_updates;
CREATE POLICY bulletin_updates_select_scoped
  ON public.bulletin_updates
  FOR SELECT
  TO authenticated
  USING (
    (
      public.has_role((select auth.uid()), 'mentor_manager'::app_role)
      OR public.has_role((select auth.uid()), 'admin'::app_role)
      OR public.has_role((select auth.uid()), 'super_admin'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.bulletin_items AS item
      WHERE item.id = bulletin_updates.bulletin_id
    )
  );

DROP POLICY IF EXISTS bulletin_updates_insert_owner_creator_or_management
  ON public.bulletin_updates;
CREATE POLICY bulletin_updates_insert_owner_creator_or_management
  ON public.bulletin_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (select auth.uid())
    AND (
      public.has_role((select auth.uid()), 'mentor_manager'::app_role)
      OR public.has_role((select auth.uid()), 'admin'::app_role)
      OR public.has_role((select auth.uid()), 'super_admin'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.bulletin_items AS item
      WHERE item.id = bulletin_updates.bulletin_id
    )
  );
