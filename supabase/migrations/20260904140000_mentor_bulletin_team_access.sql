-- Give Mentors the same Bulletin Board team access as Mentor Managers.
-- Mentors may read the full board, create leads/mandates/deals/daily updates,
-- reassign ownership and append progress on any item. Broadcast/support inbox
-- is unchanged and remains Super Admin only.
--
-- Forward-only. Do not apply with `supabase db push` against production; apply
-- deliberately after review against the live migration ledger.

-- Mentors now share the management write path, so assigned INSERT/UPDATE
-- checks must admit mentor callers. The owner must still be mentor or
-- mentor_manager.
CREATE OR REPLACE FUNCTION rpm_private.bulletin_owner_is_operational(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles AS actor_role
      WHERE actor_role.user_id = auth.uid()
        AND actor_role.role IN (
          'mentor'::public.app_role,
          'mentor_manager'::public.app_role,
          'admin'::public.app_role,
          'super_admin'::public.app_role
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS owner_role
      WHERE owner_role.user_id = _owner_id
        AND owner_role.role IN (
          'mentor'::public.app_role,
          'mentor_manager'::public.app_role
        )
    );
$$;

REVOKE ALL ON FUNCTION rpm_private.bulletin_owner_is_operational(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpm_private.bulletin_owner_is_operational(uuid)
  TO authenticated;

-- Mentors may SELECT only their own profiles row. Snapshot owner names with
-- the table-owner privileges of this trigger so peer assignment keeps a
-- colleague's display name instead of an empty string.
CREATE OR REPLACE FUNCTION public.bulletin_items_prepare_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  write_time timestamptz := now();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF actor_id IS NOT NULL
      AND NEW.created_by IS NOT NULL
      AND NEW.created_by IS DISTINCT FROM actor_id
    THEN
      RAISE EXCEPTION 'Bulletin creator must match the authenticated user'
        USING ERRCODE = '42501';
    END IF;

    NEW.created_by := COALESCE(actor_id, NEW.created_by);
    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'Bulletin creator is required'
        USING ERRCODE = '23502';
    END IF;

    NEW.created_at := write_time;
    NEW.updated_at := write_time;
    NEW.last_update_at := write_time;
    NEW.version := 1;

    NEW.created_by_name := COALESCE(
      (SELECT p.name FROM public.profiles AS p WHERE p.id = NEW.created_by),
      ''
    );

    IF NEW.owner_id IS NULL THEN
      NEW.owner_name := '';
    ELSE
      NEW.owner_name := COALESCE(
        (SELECT p.name FROM public.profiles AS p WHERE p.id = NEW.owner_id),
        ''
      );
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR (
        NEW.created_by IS NOT NULL
        AND NEW.created_by IS DISTINCT FROM OLD.created_by
      )
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Bulletin identity and provenance are immutable'
        USING ERRCODE = '42501';
    END IF;

    NEW.updated_at := write_time;
    NEW.last_update_at := GREATEST(NEW.last_update_at, write_time);
    NEW.created_by_name := OLD.created_by_name;

    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      IF NEW.owner_id IS NULL THEN
        -- Authenticated management unassigns explicitly; account-removal FK
        -- actions run without an auth actor and retain the historical name.
        -- Caller-supplied snapshot text is never accepted.
        NEW.owner_name := CASE
          WHEN actor_id IS NULL THEN OLD.owner_name
          ELSE ''
        END;
      ELSE
        NEW.owner_name := COALESCE(
          (SELECT p.name FROM public.profiles AS p WHERE p.id = NEW.owner_id),
          ''
        );
      END IF;
    ELSE
      NEW.owner_name := OLD.owner_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bulletin_items_prepare_write()
  FROM PUBLIC, anon, authenticated, service_role;

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
