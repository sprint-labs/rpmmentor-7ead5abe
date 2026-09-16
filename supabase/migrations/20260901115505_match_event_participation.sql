ALTER TABLE public.calendar_events
  ADD COLUMN participation_status text NOT NULL DEFAULT 'not_confirmed'
  CONSTRAINT calendar_events_participation_status_check
  CHECK (participation_status IN ('not_confirmed', 'played', 'did_not_play'));

COMMENT ON COLUMN public.calendar_events.participation_status IS
  'Per-goalkeeper Match participation: not_confirmed, played, or did_not_play. Ignored for non-Match events; future lineup imports update this field.';

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
    'follow_up_waived_at', 'follow_up_waiver_reason', 'participation_status'
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

  IF NEW.participation_status IS DISTINCT FROM OLD.participation_status THEN
    INSERT INTO public.calendar_event_audit (calendar_event_id, changed_by, action, before_values, after_values)
    VALUES (NEW.id, actor, 'participation_changed',
      jsonb_build_object('participation_status', OLD.participation_status),
      jsonb_build_object('participation_status', NEW.participation_status));
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
