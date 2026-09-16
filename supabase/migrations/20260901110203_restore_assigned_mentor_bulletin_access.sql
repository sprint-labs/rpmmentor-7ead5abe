-- Restore the assignment workflow without reopening the team board.
-- Management retains team-wide creation, editing, reassignment and updates.
-- Mentors may read current assignments and append immutable progress only.

ALTER POLICY bulletin_items_select_scoped
ON public.bulletin_items
TO authenticated
USING (
  public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
  OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  OR (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    AND owner_id = (select auth.uid())
  )
);

ALTER POLICY bulletin_updates_select_scoped
ON public.bulletin_updates
TO authenticated
USING (
  (
    (
      public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
      OR public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.bulletin_items AS item
      WHERE item.id = bulletin_updates.bulletin_id
    )
  )
  OR (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.bulletin_items AS item
      WHERE item.id = bulletin_updates.bulletin_id
        AND item.owner_id = (select auth.uid())
    )
  )
);

ALTER POLICY bulletin_updates_insert_owner_creator_or_management
ON public.bulletin_updates
TO authenticated
WITH CHECK (
  author_id = (select auth.uid())
  AND (
    (
      (
        public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
        OR public.has_role((select auth.uid()), 'admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
      )
      AND EXISTS (
        SELECT 1
        FROM public.bulletin_items AS item
        WHERE item.id = bulletin_updates.bulletin_id
      )
    )
    OR (
      public.has_role((select auth.uid()), 'mentor'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.bulletin_items AS item
        WHERE item.id = bulletin_updates.bulletin_id
          AND item.owner_id = (select auth.uid())
      )
    )
  )
);
