-- Event follow-ups: linking a scheduled event to the write-up it obliges.
-- Additive and idempotent.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_up_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_waived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_waiver_reason text NOT NULL DEFAULT '';

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_status_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_status_check
  CHECK (status IN ('scheduled', 'cancelled'));

CREATE INDEX IF NOT EXISTS calendar_events_status_date_idx
  ON public.calendar_events (status, event_date DESC);

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid
    REFERENCES public.calendar_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS interactions_calendar_event_id_key
  ON public.interactions (calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

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

ALTER TABLE public.match_reports_cache
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid
    REFERENCES public.calendar_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS match_reports_cache_calendar_event_id_key
  ON public.match_reports_cache (calendar_event_id)
  WHERE calendar_event_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.calendar_event_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  before_values jsonb,
  after_values jsonb
);

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
