-- Event follow-ups: linking a scheduled event to the write-up it obliges.
--
-- Every statement is additive and idempotent, so it is safe to replay against a
-- database whose migration ledger has drifted from this repository. Nothing is
-- dropped, no existing column changes type or nullability, and no existing
-- policy is widened. Rows created before this migration stay readable exactly as
-- they are: the one existing calendar event acquires status 'scheduled' and no
-- follow-up requirement, because its retired event type carries none.
--
-- Deliberate design note: there is NO separate "follow-up requirement" table.
-- The requirement is the event. A status is derived from the event's type, its
-- London-time schedule, whether it was cancelled or waived, and whether a linked
-- record exists. That makes "exactly one requirement per event" a structural
-- guarantee rather than something application code has to remember, and means a
-- reschedule, a reassignment or a change of type updates the single existing
-- requirement instead of risking a duplicate.
--
-- Scope:
--   1. calendar_events    — cancellation and waiver state
--   2. interactions       — durable link back to the event it wrote up
--   3. match_reports_cache— the same link for Match Reports
--   4. calendar_event_audit — who changed an event, when, from what to what
--   5. notifications      — the assigned mentor's inbox
--   6. list_mentor_directory() — assignable mentors, by role, without exposing
--                               user_roles to the client

-- ---------------------------------------------------------------------------
-- 1. calendar_events: cancellation and waiver
--
-- Both are recorded on the event itself. A cancelled or waived event keeps its
-- history; nothing is deleted, so an audit reader can always see what was
-- scheduled and what happened to the obligation.
-- ---------------------------------------------------------------------------

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_up_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_waived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_waiver_reason text NOT NULL DEFAULT '';

-- Re-created rather than added conditionally so the definition is unambiguous on
-- replay. The only existing row holds the default, so validation cannot fail.
ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_status_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_status_check
  CHECK (status IN ('scheduled', 'cancelled'));

COMMENT ON COLUMN public.calendar_events.status IS
  'scheduled | cancelled. Cancelling closes the follow-up requirement without destroying the event.';
COMMENT ON COLUMN public.calendar_events.follow_up_waiver_reason IS
  'Why an authorised manager decided no write-up is required. Empty unless follow_up_waived_at is set.';

-- Outstanding-work queries filter on status and date together.
CREATE INDEX IF NOT EXISTS calendar_events_status_date_idx
  ON public.calendar_events (status, event_date DESC);

-- ---------------------------------------------------------------------------
-- 2. interactions: the event this interaction wrote up
--
-- The partial unique index is the database-level guarantee that one event can be
-- closed out by at most one interaction, however many times a save is retried.
-- ---------------------------------------------------------------------------

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid
    REFERENCES public.calendar_events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.interactions.calendar_event_id IS
  'The scheduled event this interaction is the write-up for. NULL for an interaction logged off the back of no scheduled event.';

CREATE UNIQUE INDEX IF NOT EXISTS interactions_calendar_event_id_key
  ON public.interactions (calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

-- The existing guard already freezes authorship, creation time and the Match
-- Report link. Replaced here to freeze the event link on the same terms: an edit
-- corrects what happened, it never re-points the record at a different event.
CREATE OR REPLACE FUNCTION public.interactions_guard_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.interactions_guard_immutable_columns() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. match_reports_cache: the event this report wrote up
--
-- The canonical report store identifies a goalkeeper by name and holds no
-- player id or mentor id. Linking to the event supplies both canonically: the
-- event carries player_id and assigned_mentor_id, so a report reached through
-- this column is provably tied to the right goalkeeper and the right mentor
-- without any name matching.
--
-- Soft-deleted rows are excluded from the uniqueness guarantee: withdrawing a
-- report must free the event to be written up again.
-- ---------------------------------------------------------------------------

ALTER TABLE public.match_reports_cache
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid
    REFERENCES public.calendar_events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.match_reports_cache.calendar_event_id IS
  'The scheduled Match event this report is the write-up for. NULL for a report submitted without a scheduled event, including every historic and backfilled row.';

CREATE UNIQUE INDEX IF NOT EXISTS match_reports_cache_calendar_event_id_key
  ON public.match_reports_cache (calendar_event_id)
  WHERE calendar_event_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. calendar_event_audit
--
-- Mirrors the shape and permissions of interaction_audit: written only by a
-- SECURITY DEFINER trigger, never writable from the client, and readable by
-- management roles and by the mentor the event concerns.
--
-- A trigger rather than application code, so a change made through any path —
-- including a future one, or a correction made by hand — is recorded.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.calendar_event_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  before_values jsonb,
  after_values jsonb
);

COMMENT ON TABLE public.calendar_event_audit IS
  'Change history for scheduled events: creation, rescheduling, reassignment, type changes, cancellation and follow-up waivers.';

CREATE INDEX IF NOT EXISTS calendar_event_audit_event_id_idx
  ON public.calendar_event_audit (calendar_event_id, changed_at DESC);

ALTER TABLE public.calendar_event_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_event_audit_select_scoped ON public.calendar_event_audit;
CREATE POLICY calendar_event_audit_select_scoped
  ON public.calendar_event_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.calendar_events e
      WHERE e.id = calendar_event_audit.calendar_event_id
        AND e.assigned_mentor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS calendar_event_audit_no_client_insert ON public.calendar_event_audit;
CREATE POLICY calendar_event_audit_no_client_insert
  ON public.calendar_event_audit FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS calendar_event_audit_no_client_update ON public.calendar_event_audit;
CREATE POLICY calendar_event_audit_no_client_update
  ON public.calendar_event_audit FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS calendar_event_audit_no_client_delete ON public.calendar_event_audit;
CREATE POLICY calendar_event_audit_no_client_delete
  ON public.calendar_event_audit FOR DELETE TO anon, authenticated USING (false);

-- One row per change, with the action named after what actually changed so the
-- history reads as a story rather than a diff dump. Several actions can be
-- recorded for a single save when a manager changes more than one thing at once.
CREATE OR REPLACE FUNCTION public.calendar_events_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audited_columns text[] := ARRAY[
    'title', 'event_type', 'event_date', 'start_time', 'end_time', 'location',
    'notes', 'player_id', 'goalkeeper_name', 'assigned_mentor_id',
    'assigned_mentor_name', 'status', 'cancellation_reason',
    'follow_up_waived_at', 'follow_up_waiver_reason'
  ];
  -- Fields with no dedicated action below. Kept separate so a reschedule is
  -- recorded once, as a reschedule, rather than also as a generic update.
  general_columns text[] := ARRAY['title', 'location', 'notes'];
  before_doc jsonb;
  after_doc jsonb;
  actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (
      NEW.id,
      COALESCE(actor, NEW.created_by),
      'created',
      NULL,
      (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY (audited_columns))
    );
    RETURN NEW;
  END IF;

  before_doc := (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY (audited_columns));
  after_doc  := (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY (audited_columns));

  IF before_doc IS NOT DISTINCT FROM after_doc THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_mentor_id IS DISTINCT FROM OLD.assigned_mentor_id THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor, 'reassigned',
      jsonb_build_object('assigned_mentor_id', OLD.assigned_mentor_id, 'assigned_mentor_name', OLD.assigned_mentor_name),
      jsonb_build_object('assigned_mentor_id', NEW.assigned_mentor_id, 'assigned_mentor_name', NEW.assigned_mentor_name));
  END IF;

  IF NEW.event_date IS DISTINCT FROM OLD.event_date
     OR NEW.start_time IS DISTINCT FROM OLD.start_time
     OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor, 'rescheduled',
      jsonb_build_object('event_date', OLD.event_date, 'start_time', OLD.start_time, 'end_time', OLD.end_time),
      jsonb_build_object('event_date', NEW.event_date, 'start_time', NEW.start_time, 'end_time', NEW.end_time));
  END IF;

  IF NEW.event_type IS DISTINCT FROM OLD.event_type THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor, 'type_changed',
      jsonb_build_object('event_type', OLD.event_type),
      jsonb_build_object('event_type', NEW.event_type));
  END IF;

  IF NEW.player_id IS DISTINCT FROM OLD.player_id THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor, 'goalkeeper_changed',
      jsonb_build_object('player_id', OLD.player_id, 'goalkeeper_name', OLD.goalkeeper_name),
      jsonb_build_object('player_id', NEW.player_id, 'goalkeeper_name', NEW.goalkeeper_name));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor,
      CASE WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'reinstated' END,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'cancellation_reason', NEW.cancellation_reason));
  END IF;

  IF NEW.follow_up_waived_at IS DISTINCT FROM OLD.follow_up_waived_at THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor,
      CASE WHEN NEW.follow_up_waived_at IS NULL THEN 'follow_up_reinstated' ELSE 'follow_up_waived' END,
      jsonb_build_object('follow_up_waived_at', OLD.follow_up_waived_at, 'follow_up_waiver_reason', OLD.follow_up_waiver_reason),
      jsonb_build_object('follow_up_waived_at', NEW.follow_up_waived_at, 'follow_up_waiver_reason', NEW.follow_up_waiver_reason));
  END IF;

  -- Title, location and notes have no dedicated action, so they are recorded
  -- here. The history is therefore complete without repeating a change that has
  -- already been named above.
  before_doc := (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY (general_columns));
  after_doc  := (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY (general_columns));
  IF before_doc IS DISTINCT FROM after_doc THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor, 'updated', before_doc, after_doc);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calendar_events_write_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calendar_events_audit ON public.calendar_events;
CREATE TRIGGER calendar_events_audit
  AFTER INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.calendar_events_write_audit();

-- ---------------------------------------------------------------------------
-- 5. notifications
--
-- A durable inbox. Until now the only notifications in the product lived in
-- browser localStorage, which means a mentor who is told about an event on one
-- device has no record of it on another, and a manager has no way to know what
-- was sent. These rows persist and are readable across sessions and devices.
--
-- The rendered title and body are stored rather than recomputed, so the record
-- shows what the mentor was actually told at the time, even if the event is
-- edited afterwards.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link_path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  read_at timestamptz
);

COMMENT ON TABLE public.notifications IS
  'Durable per-user notification inbox. An overdue follow-up recorded here is an operational duty-of-care alert, not a safeguarding classification.';

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'event_assigned',
    'event_updated',
    'event_unassigned',
    'event_cancelled',
    'follow_up_overdue'
  ));

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id)
  WHERE read_at IS NULL;

-- One overdue alert per mentor per event, ever. Without this, every page load
-- that noticed a passed deadline would add another row.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_overdue_once_key
  ON public.notifications (recipient_id, calendar_event_id)
  WHERE kind = 'follow_up_overdue';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- A manager assigns work to other people, so they must be able to write to
-- another mentor's inbox. A mentor may also write to their OWN inbox, which is
-- what records an overdue alert when they next open the app.
DROP POLICY IF EXISTS notifications_insert_authorised ON public.notifications;
CREATE POLICY notifications_insert_authorised
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    recipient_id = auth.uid()
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS notifications_no_client_delete ON public.notifications;
CREATE POLICY notifications_no_client_delete
  ON public.notifications FOR DELETE TO anon, authenticated USING (false);

-- RLS cannot express column-level permission. Marking a notification read is the
-- only edit anyone is allowed to make to their own inbox; the record of what
-- they were told stays as it was sent.
CREATE OR REPLACE FUNCTION public.notifications_guard_read_state_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) - 'read_at' IS DISTINCT FROM to_jsonb(OLD) - 'read_at' THEN
    RAISE EXCEPTION 'Only read_at may be updated on a notification';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notifications_guard_read_state_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_guard_read_state ON public.notifications;
CREATE TRIGGER notifications_guard_read_state
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_guard_read_state_only();

-- ---------------------------------------------------------------------------
-- 6. list_mentor_directory()
--
-- Who an event may be assigned to. `user_roles` is deliberately read-own-only
-- under RLS, so a client cannot ask "who are the mentors?" directly. This
-- function answers exactly that question and nothing else: no email addresses,
-- no role details beyond mentor status, no other profile fields.
--
-- Returning role-holders rather than a hard-coded list of names means adding or
-- removing a mentor is a `user_roles` change with no code release.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_mentor_directory()
RETURNS TABLE (id uuid, name text, is_manager boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(p.name, '') AS name,
    public.has_role(p.id, 'mentor_manager'::app_role) AS is_manager
  FROM public.profiles p
  WHERE public.has_role(p.id, 'mentor'::app_role)
     OR public.has_role(p.id, 'mentor_manager'::app_role)
  ORDER BY COALESCE(p.name, '');
$$;

REVOKE EXECUTE ON FUNCTION public.list_mentor_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_mentor_directory() TO authenticated;
