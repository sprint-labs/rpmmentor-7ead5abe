-- Calendar events: record which mentor is attending.
--
-- A mentor manager schedules an event ("on this date, this mentor sees this
-- goalkeeper"); the mentor later logs what happened. Until now the table had no
-- way to name the attending mentor, so every mentor saw the whole team's
-- calendar and nothing tied a scheduled event to the person expected to attend.
--
-- The column is nullable on purpose. Rows created before this migration have no
-- assignment and one cannot be inferred — `created_by` is the manager who
-- scheduled the event, not the mentor attending it, and matching on names is
-- not permitted. The application requires the field when creating or editing an
-- event, so nulls only ever mean "scheduled before mentors were assignable".
--
-- `assigned_mentor_name` is denormalised for the same reason `created_by_name`
-- is: `profiles` SELECT is restricted to your own row unless you are an admin,
-- mentor_manager or super_admin, so a mentor reading their own calendar cannot
-- resolve another profile id into a name.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS assigned_mentor_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_mentor_name text NOT NULL DEFAULT '';

-- Mentor home reads "my upcoming events" as assigned mentor + forward date window.
CREATE INDEX IF NOT EXISTS calendar_events_assigned_mentor_date_idx
  ON public.calendar_events (assigned_mentor_id, event_date);

COMMENT ON COLUMN public.calendar_events.assigned_mentor_id IS
  'Profile of the mentor expected to attend. Null only for events scheduled before mentors were assignable, or where that profile was deleted.';
