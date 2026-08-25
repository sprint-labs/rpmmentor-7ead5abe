-- Recoverable Super Admin deletion for interactions and canonical player records.
--
-- Both entities are tombstoned rather than physically deleted. This preserves
-- interaction audit/media links, player UUID links from historical activity,
-- and the full source row for a controlled restoration. Existing app reads are
-- updated with `deleted_at IS NULL`; service-role maintenance may still perform
-- a deliberate physical purge outside the product UI.

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.interactions.deleted_at IS
  'Recoverable product deletion timestamp. NULL means active.';
COMMENT ON COLUMN public.interactions.deleted_by IS
  'Authenticated Super Admin UUID that tombstoned the interaction. Deliberately retained without an FK so later account removal cannot erase provenance.';
COMMENT ON COLUMN public.players.deleted_at IS
  'Recoverable product deletion timestamp. NULL means active.';
COMMENT ON COLUMN public.players.deleted_by IS
  'Authenticated Super Admin UUID that tombstoned the player record. Deliberately retained without an FK so later account removal cannot erase provenance.';

ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_deleted_pair_check;
ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_deleted_pair_check;
ALTER TABLE public.players
  ADD CONSTRAINT players_deleted_pair_check
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

CREATE INDEX IF NOT EXISTS interactions_active_occurred_at_idx
  ON public.interactions (occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS calendar_events_active_player_date_idx
  ON public.calendar_events (player_id, event_date)
  WHERE status <> 'cancelled';

-- Archived mistakes must not reserve a name forever, while active names remain
-- unique case-insensitively just as they were before this migration.
DROP INDEX IF EXISTS public.players_full_name_lower_idx;
CREATE UNIQUE INDEX players_full_name_lower_idx
  ON public.players (lower(full_name))
  WHERE deleted_at IS NULL;

-- A tombstoned derived interaction no longer occupies the active one-to-one
-- slot. This makes a controlled replacement possible without destroying the
-- retained row or its audit history.
DROP INDEX IF EXISTS public.interactions_match_report_id_key;
CREATE UNIQUE INDEX interactions_match_report_id_key
  ON public.interactions (match_report_id)
  WHERE match_report_id IS NOT NULL AND deleted_at IS NULL;

DROP INDEX IF EXISTS public.interactions_calendar_event_id_key;
CREATE UNIQUE INDEX interactions_calendar_event_id_key
  ON public.interactions (calendar_event_id)
  WHERE calendar_event_id IS NOT NULL AND deleted_at IS NULL;

-- Product clients must use the recoverable UPDATE path. The old historical
-- DELETE policy was broader (authors and management roles) and a hard delete
-- cascades away interaction_audit and interaction_media rows.
DROP POLICY IF EXISTS interactions_delete_authorised ON public.interactions;
REVOKE DELETE ON public.interactions, public.players FROM anon, authenticated;

-- RLS and row triggers do not protect TRUNCATE. Earlier broad table grants
-- included it, so remove that database-level escape hatch for browser roles.
REVOKE TRUNCATE ON
  public.interactions,
  public.players,
  public.interaction_audit,
  public.interaction_media
FROM anon, authenticated;

-- Normal authenticated reads see only active records. Super Admins retain
-- read access to tombstones for confirmed update read-back and future recovery.
DROP POLICY IF EXISTS interactions_select_privileged ON public.interactions;
CREATE POLICY interactions_select_privileged
  ON public.interactions
  FOR SELECT
  TO authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        public.has_role(auth.uid(), 'mentor'::public.app_role)
        OR public.has_role(auth.uid(), 'mentor_manager'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can read players" ON public.players;
CREATE POLICY "Authenticated can read players"
  ON public.players
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Voice-note links remain retained but stop being readable/attachable as soon
-- as their parent interaction is tombstoned.
DROP POLICY IF EXISTS interaction_media_select_scoped ON public.interaction_media;
-- This is the current live policy name; permissive policies are ORed, so
-- leaving it in place would still expose archived audio links.
DROP POLICY IF EXISTS interaction_media_select_authorised ON public.interaction_media;
CREATE POLICY interaction_media_select_scoped
  ON public.interaction_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.id = interaction_media.interaction_id
        AND i.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS interaction_media_insert_authorised ON public.interaction_media;
CREATE POLICY interaction_media_insert_authorised
  ON public.interaction_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    attached_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.id = interaction_media.interaction_id
        AND i.deleted_at IS NULL
        AND (
          i.mentor_id = auth.uid()
          OR public.has_role(auth.uid(), 'mentor_manager'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.media_assets m
      WHERE m.id = interaction_media.media_id
    )
  );

-- Preserve immutable authorship/linkage and reserve tombstoning for a genuine
-- Super Admin. Service-role maintenance (auth.uid() IS NULL) remains possible.
CREATE OR REPLACE FUNCTION public.interactions_guard_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Operational inserts are always active. Without this branch, a direct
  -- authenticated client could forge an already-archived hidden row and its
  -- deletion actor through the ordinary INSERT policy.
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND (NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL) THEN
      RAISE EXCEPTION 'New interactions cannot include deletion metadata';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id THEN
    RAISE EXCEPTION 'interactions.mentor_id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'interactions.created_at is immutable';
  END IF;
  IF NEW.match_report_id IS DISTINCT FROM OLD.match_report_id THEN
    RAISE EXCEPTION 'interactions.match_report_id is immutable';
  END IF;
  IF NEW.calendar_event_id IS DISTINCT FROM OLD.calendar_event_id THEN
    RAISE EXCEPTION 'interactions.calendar_event_id is immutable';
  END IF;

  -- Once archived, a browser session cannot rewrite or restore the retained
  -- record. Restoration is an explicit service-role maintenance operation.
  IF OLD.deleted_at IS NOT NULL AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Archived interactions cannot be edited or restored from the application';
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND auth.uid() IS NOT NULL THEN
    IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only a Super Admin may delete an interaction';
    END IF;
    IF NEW.deleted_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'interactions.deleted_by must match the authenticated Super Admin';
    END IF;
  ELSIF (
    NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
  ) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Interaction deletion metadata is immutable';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.interactions_guard_immutable_columns()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS interactions_guard_immutable ON public.interactions;
CREATE TRIGGER interactions_guard_immutable
  BEFORE INSERT OR UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.interactions_guard_immutable_columns();

-- Record tombstoning as an explicit audit action while the source row remains.
CREATE OR REPLACE FUNCTION public.interactions_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audited_columns text[] := ARRAY[
    'goalkeeper_name', 'player_id', 'gk_slug', 'interaction_type',
    'club', 'occurred_at', 'notes', 'outcome', 'follow_up',
    'deleted_at', 'deleted_by'
  ];
  before_doc jsonb;
  after_doc jsonb;
  audit_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.interaction_audit
      (interaction_id, changed_by, action, before_values, after_values)
    VALUES (
      NEW.id,
      NEW.mentor_id,
      'insert',
      NULL,
      (SELECT jsonb_object_agg(key, value)
       FROM jsonb_each(to_jsonb(NEW))
       WHERE key = ANY (audited_columns))
    );
    RETURN NEW;
  END IF;

  before_doc := (
    SELECT jsonb_object_agg(key, value)
    FROM jsonb_each(to_jsonb(OLD))
    WHERE key = ANY (audited_columns)
  );
  after_doc := (
    SELECT jsonb_object_agg(key, value)
    FROM jsonb_each(to_jsonb(NEW))
    WHERE key = ANY (audited_columns)
  );

  IF before_doc IS DISTINCT FROM after_doc THEN
    audit_action := CASE
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
      WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
      ELSE 'update'
    END;
    INSERT INTO public.interaction_audit
      (interaction_id, changed_by, action, before_values, after_values)
    VALUES (
      NEW.id,
      CASE audit_action
        WHEN 'delete' THEN NEW.deleted_by
        WHEN 'restore' THEN auth.uid()
        ELSE COALESCE(NEW.updated_by, auth.uid())
      END,
      audit_action,
      before_doc,
      after_doc
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.interactions_write_audit()
  FROM PUBLIC, anon, authenticated;

-- Apply the same actor and immutability guarantees to player tombstones. A
-- player with a future, non-cancelled event must be resolved first so the
-- calendar never points at a player who has disappeared from operational use.
CREATE OR REPLACE FUNCTION public.players_guard_deletion_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Archived player records cannot be edited or restored from the application';
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND auth.uid() IS NOT NULL THEN
    IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only a Super Admin may delete a player record';
    END IF;
    IF NEW.deleted_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'players.deleted_by must match the authenticated Super Admin';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.calendar_events ce
      WHERE ce.player_id = OLD.id
        AND ce.event_date >= (now() AT TIME ZONE 'Europe/London')::date
        AND ce.status IS DISTINCT FROM 'cancelled'
    ) THEN
      RAISE EXCEPTION 'Resolve this player''s upcoming calendar events before deleting the record';
    END IF;
  ELSIF (
    NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
  ) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Player deletion metadata is immutable';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.players_guard_deletion_metadata()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS players_guard_deletion_metadata ON public.players;
CREATE TRIGGER players_guard_deletion_metadata
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_guard_deletion_metadata();

-- Prevent the Super Admin browser session from bypassing the recoverable player
-- path through the existing FOR ALL policy. Service-role maintenance may still
-- perform a deliberate physical purge when separately authorised.
CREATE OR REPLACE FUNCTION public.players_prevent_client_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Player records must be archived, not permanently deleted';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.players_prevent_client_hard_delete()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS players_prevent_client_hard_delete ON public.players;
CREATE TRIGGER players_prevent_client_hard_delete
  BEFORE DELETE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_prevent_client_hard_delete();
