-- RPM Bulletin Board MVP.
--
-- Four explicit operational boards share one small workflow contract. Mentors
-- can create work for themselves and append progress to work they created or
-- own. Mentor Managers, Admins and Super Admins can see and manage the team.
-- Updates are append-only and neither table exposes a hard-delete path.
--
-- Forward-only and deliberately unapplied by this change. The RPM production
-- database has an authoritative migration ledger; do not use `supabase db push`
-- to apply this file.

CREATE TABLE public.bulletin_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  subject_type text NOT NULL DEFAULT 'other',
  subject_name text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  due_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_update_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT bulletin_items_kind_check
    CHECK (kind IN ('daily_update', 'deal', 'lead', 'mandate')),
  CONSTRAINT bulletin_items_status_check
    CHECK (status IN ('open', 'working', 'blocked', 'closed')),
  CONSTRAINT bulletin_items_subject_type_check
    CHECK (subject_type IN ('club', 'player', 'other')),
  CONSTRAINT bulletin_items_title_len
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT bulletin_items_details_len
    CHECK (char_length(details) <= 8000),
  CONSTRAINT bulletin_items_subject_name_len
    CHECK (char_length(btrim(subject_name)) BETWEEN 1 AND 160),
  CONSTRAINT bulletin_items_owner_name_len
    CHECK (char_length(owner_name) <= 160),
  CONSTRAINT bulletin_items_created_by_name_len
    CHECK (char_length(created_by_name) <= 160),
  CONSTRAINT bulletin_items_next_action_len
    CHECK (char_length(next_action) <= 500),
  CONSTRAINT bulletin_items_version_positive
    CHECK (version > 0)
);

COMMENT ON TABLE public.bulletin_items IS
  'Four-board RPM agency operations register: Daily Updates, Deals, Leads and Mandates.';
COMMENT ON COLUMN public.bulletin_items.owner_id IS
  'Current responsible RPM user. NULL is an intentional management-owned unassigned queue.';
COMMENT ON COLUMN public.bulletin_items.owner_name IS
  'Display snapshot captured when ownership changes; owner_id remains canonical.';
COMMENT ON COLUMN public.bulletin_items.created_by_name IS
  'Display snapshot retained if the originating account is later removed.';
COMMENT ON COLUMN public.bulletin_items.version IS
  'Optimistic concurrency token. Structured management edits and appended updates advance it.';

CREATE INDEX bulletin_items_board_status_activity_idx
  ON public.bulletin_items (kind, status, last_update_at DESC, id);
CREATE INDEX bulletin_items_owner_open_activity_idx
  ON public.bulletin_items (owner_id, last_update_at DESC, id)
  WHERE owner_id IS NOT NULL AND status <> 'closed';
CREATE INDEX bulletin_items_creator_open_activity_idx
  ON public.bulletin_items (created_by, last_update_at DESC, id)
  WHERE created_by IS NOT NULL AND status <> 'closed';
CREATE INDEX bulletin_items_open_due_idx
  ON public.bulletin_items (due_date, kind, id)
  WHERE due_date IS NOT NULL AND status <> 'closed';

CREATE TABLE public.bulletin_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id uuid NOT NULL REFERENCES public.bulletin_items(id) ON DELETE RESTRICT,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bulletin_updates_author_name_len
    CHECK (char_length(author_name) <= 160),
  CONSTRAINT bulletin_updates_body_len
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000)
);

COMMENT ON TABLE public.bulletin_updates IS
  'Append-only Bulletin Board progress history. There is no client update or delete path.';
COMMENT ON COLUMN public.bulletin_updates.author_name IS
  'Display snapshot retained if the author account is later removed.';

CREATE INDEX bulletin_updates_item_created_idx
  ON public.bulletin_updates (bulletin_id, created_at DESC, id);
CREATE INDEX bulletin_updates_author_created_idx
  ON public.bulletin_updates (author_id, created_at DESC, id)
  WHERE author_id IS NOT NULL;

-- Assignment validation has to inspect another user's role. The existing
-- public.has_role() is deliberately SECURITY INVOKER and can only see the
-- caller's own user_roles row under RLS, so keep this narrow cross-user lookup
-- in a non-exposed schema. It returns true only to a management caller.
CREATE SCHEMA IF NOT EXISTS rpm_private;
REVOKE ALL ON SCHEMA rpm_private
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA rpm_private TO authenticated;

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

-- Canonical UUIDs drive permissions. Names are immutable-at-write display
-- snapshots, so a client cannot forge another colleague's name.
CREATE OR REPLACE FUNCTION public.bulletin_items_prepare_write()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE TRIGGER bulletin_items_prepare_write_trigger
  BEFORE INSERT OR UPDATE ON public.bulletin_items
  FOR EACH ROW EXECUTE FUNCTION public.bulletin_items_prepare_write();

CREATE OR REPLACE FUNCTION public.bulletin_updates_prepare_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NOT NULL
    AND NEW.author_id IS NOT NULL
    AND NEW.author_id IS DISTINCT FROM actor_id
  THEN
    RAISE EXCEPTION 'Bulletin update author must match the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  NEW.author_id := COALESCE(actor_id, NEW.author_id);
  IF NEW.author_id IS NULL THEN
    RAISE EXCEPTION 'Bulletin update author is required'
      USING ERRCODE = '23502';
  END IF;

  NEW.created_at := now();
  NEW.author_name := COALESCE(
    (SELECT p.name FROM public.profiles AS p WHERE p.id = NEW.author_id),
    ''
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bulletin_updates_prepare_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bulletin_updates_prepare_write_trigger
  BEFORE INSERT ON public.bulletin_updates
  FOR EACH ROW EXECUTE FUNCTION public.bulletin_updates_prepare_write();

-- A mentor intentionally has no UPDATE privilege on bulletin_items. This
-- tightly-scoped trigger is therefore the only privileged parent write caused
-- by their append-only update. Direct execution is revoked from every API role.
CREATE OR REPLACE FUNCTION public.bulletin_updates_touch_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NOT NULL AND NEW.author_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Bulletin update author must match the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.bulletin_items
  SET
    last_update_at = GREATEST(last_update_at, NEW.created_at),
    version = version + 1
  WHERE id = NEW.bulletin_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bulletin_updates_touch_parent()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bulletin_updates_touch_parent_trigger
  AFTER INSERT ON public.bulletin_updates
  FOR EACH ROW EXECUTE FUNCTION public.bulletin_updates_touch_parent();

ALTER TABLE public.bulletin_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY bulletin_items_select_scoped
  ON public.bulletin_items
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'mentor_manager'::app_role)
    OR public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::app_role)
    OR (
      public.has_role((select auth.uid()), 'mentor'::app_role)
      AND (
        owner_id = (select auth.uid())
        OR created_by = (select auth.uid())
      )
    )
  );

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
      OR public.has_role((select auth.uid()), 'mentor'::app_role)
    )
    AND (
      (
        (
          public.has_role((select auth.uid()), 'mentor_manager'::app_role)
          OR public.has_role((select auth.uid()), 'admin'::app_role)
          OR public.has_role((select auth.uid()), 'super_admin'::app_role)
        )
        AND (
          owner_id IS NULL
          OR rpm_private.bulletin_owner_is_operational(owner_id)
        )
      )
      OR (
        public.has_role((select auth.uid()), 'mentor'::app_role)
        AND owner_id = (select auth.uid())
        AND status = 'open'
      )
    )
  );

CREATE POLICY bulletin_items_update_management
  ON public.bulletin_items
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'mentor_manager'::app_role)
    OR public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::app_role)
  )
  WITH CHECK (
    (
      public.has_role((select auth.uid()), 'mentor_manager'::app_role)
      OR public.has_role((select auth.uid()), 'admin'::app_role)
      OR public.has_role((select auth.uid()), 'super_admin'::app_role)
    )
    AND (
      owner_id IS NULL
      OR rpm_private.bulletin_owner_is_operational(owner_id)
    )
  );

CREATE POLICY bulletin_updates_select_scoped
  ON public.bulletin_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bulletin_items AS item
      WHERE item.id = bulletin_updates.bulletin_id
    )
  );

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
      OR (
        public.has_role((select auth.uid()), 'mentor'::app_role)
        AND EXISTS (
          SELECT 1
          FROM public.bulletin_items AS item
          WHERE item.id = bulletin_updates.bulletin_id
            AND (
              item.owner_id = (select auth.uid())
              OR item.created_by = (select auth.uid())
            )
        )
      )
    )
  );

-- Supabase's 2026 Data API defaults make exposure opt-in. Revoke any project
-- defaults first, then grant only the operations this workflow needs.
REVOKE ALL ON TABLE public.bulletin_items
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.bulletin_updates
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.bulletin_items TO authenticated;
GRANT UPDATE (
  title,
  details,
  subject_type,
  subject_name,
  status,
  owner_id,
  next_action,
  due_date,
  version
) ON TABLE public.bulletin_items TO authenticated;
GRANT SELECT, INSERT ON TABLE public.bulletin_updates TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.bulletin_items TO service_role;
GRANT SELECT, INSERT ON TABLE public.bulletin_updates TO service_role;
