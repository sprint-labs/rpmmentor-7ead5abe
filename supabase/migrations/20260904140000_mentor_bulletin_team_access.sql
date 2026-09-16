-- Give Mentors the same Bulletin Board team access as Mentor Managers.
-- Mentors may read the full board, create leads/mandates/deals/daily updates,
-- reassign ownership and append progress on any item. Broadcast/support inbox
-- is unchanged and remains Super Admin only.
--
-- Forward-only. Do not apply with `supabase db push` against production; apply
-- deliberately after review against the live migration ledger.

ALTER POLICY bulletin_items_select_scoped
ON public.bulletin_items
TO authenticated
USING (
  public.has_role((select auth.uid()), 'mentor'::public.app_role)
  OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
  OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
);

ALTER POLICY bulletin_items_insert_operational
ON public.bulletin_items
TO authenticated
WITH CHECK (
  created_by = (select auth.uid())
  AND (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
  AND (
    owner_id IS NULL
    OR rpm_private.bulletin_owner_is_operational(owner_id)
  )
);

ALTER POLICY bulletin_items_update_management
ON public.bulletin_items
TO authenticated
USING (
  public.has_role((select auth.uid()), 'mentor'::public.app_role)
  OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
  OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
)
WITH CHECK (
  (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
  AND (
    owner_id IS NULL
    OR rpm_private.bulletin_owner_is_operational(owner_id)
  )
);

ALTER POLICY bulletin_updates_select_scoped
ON public.bulletin_updates
TO authenticated
USING (
  (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
  AND EXISTS (
    SELECT 1
    FROM public.bulletin_items AS item
    WHERE item.id = bulletin_updates.bulletin_id
  )
);

ALTER POLICY bulletin_updates_insert_owner_creator_or_management
ON public.bulletin_updates
TO authenticated
WITH CHECK (
  author_id = (select auth.uid())
  AND (
    public.has_role((select auth.uid()), 'mentor'::public.app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  )
  AND EXISTS (
    SELECT 1
    FROM public.bulletin_items AS item
    WHERE item.id = bulletin_updates.bulletin_id
  )
);
