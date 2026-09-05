-- Bind a linked Match Report to the exact calendar-event player snapshot that
-- was verified by the application.  The guard runs in the same transaction as
-- the canonical report INSERT, closing the gap in which a manager could change
-- the event after the application preflight but before the report was saved.
--
-- Existing reports are deliberately left untouched.  NULL therefore means a
-- report predates this guard (or is not linked to a calendar event); it must not
-- be interpreted as a guessed player.

ALTER TABLE public.match_reports_cache
  ADD COLUMN calendar_event_player_id uuid;

COMMENT ON COLUMN public.match_reports_cache.calendar_event_player_id IS
  'Immutable players.id snapshot for a linked calendar Match at report insertion. NULL for standalone and pre-migration reports; never backfilled by inference.';

-- Record why an overdue notification was valid when it was created.  Historic
-- Match reminders created before participation existed remain NULL and are kept
-- for audit, but they no longer consume the unique slot for a future reminder
-- that is explicitly based on Played participation.
ALTER TABLE public.notifications
  ADD COLUMN follow_up_basis text;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_follow_up_basis_check
  CHECK (
    follow_up_basis IS NULL
    OR (
      kind = 'follow_up_overdue'
      AND follow_up_basis IN ('match_played', 'interaction')
    )
  );

COMMENT ON COLUMN public.notifications.follow_up_basis IS
  'Eligibility provenance for follow_up_overdue: match_played or interaction. NULL marks pre-migration/unverified reminders, which the app keeps hidden.';

-- Preserve legitimate historical reminders without guessing that an
-- unconfirmed Match goalkeeper played. Non-Match follow-ups have never depended
-- on participation, so their interaction provenance is safe to retain.
UPDATE public.notifications AS notification
SET follow_up_basis = CASE
  WHEN event.event_type = 'Match'
       AND event.participation_status = 'played'
       AND notification.link_path LIKE '/reports?%' THEN 'match_played'
  WHEN event.event_type IN ('Training Ground Visit', 'Coffee Catch-up')
       AND notification.link_path LIKE '/interactions?%' THEN 'interaction'
  ELSE NULL
END
FROM public.calendar_events AS event
WHERE notification.kind = 'follow_up_overdue'
  AND notification.calendar_event_id = event.id;

DROP INDEX IF EXISTS public.notifications_overdue_once_key;

CREATE UNIQUE INDEX notifications_overdue_basis_once_key
  ON public.notifications (recipient_id, calendar_event_id, follow_up_basis)
  WHERE kind = 'follow_up_overdue' AND follow_up_basis IS NOT NULL;

-- During the brief schema-first deployment window an old application build may
-- still omit the basis. Keep those writes deduplicated and hidden until the
-- compatible build is promoted.
CREATE UNIQUE INDEX notifications_overdue_legacy_once_key
  ON public.notifications (recipient_id, calendar_event_id)
  WHERE kind = 'follow_up_overdue' AND follow_up_basis IS NULL;

CREATE OR REPLACE FUNCTION public.match_reports_guard_event_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  linked_event record;
  is_restoration boolean := false;
  submitter_can_write boolean := false;
  submitter_can_write_any boolean := false;
  submitter_role public.app_role;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Keep deliberate relinking immutable, but preserve the existing
    -- calendar_events FK contract: ON DELETE SET NULL must still be able to
    -- detach a retained historical report when its event is removed.
    IF NEW.calendar_event_id IS DISTINCT FROM OLD.calendar_event_id
       AND NOT (
         OLD.calendar_event_id IS NOT NULL
         AND NEW.calendar_event_id IS NULL
       ) THEN
      RAISE EXCEPTION 'match_reports_cache.calendar_event_id is immutable';
    END IF;

    is_restoration := OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL;

    -- A legacy linked tombstone may acquire its first trustworthy snapshot only
    -- while it is explicitly restored and revalidated below.  Every other
    -- attempt to rewrite report/player provenance is rejected.
    IF NEW.calendar_event_player_id IS DISTINCT FROM OLD.calendar_event_player_id
       AND NOT (
         is_restoration
         AND OLD.calendar_event_player_id IS NULL
       ) THEN
      RAISE EXCEPTION 'match_reports_cache.calendar_event_player_id is immutable';
    END IF;

    -- Score/comment corrections and soft deletion retain the original snapshot
    -- without making current fixture state rewrite historical evidence.
    IF NOT is_restoration THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.calendar_event_id IS NULL THEN
    -- A snapshot may outlive its event when the existing FK performs
    -- ON DELETE SET NULL.  It remains immutable evidence, and a later restore
    -- of that soft-deleted report must not be blocked merely because the event
    -- has since been removed.  Only a brand-new unlinked row is forbidden from
    -- inventing a snapshot.
    IF TG_OP = 'INSERT' THEN
      IF NEW.calendar_event_player_id IS NOT NULL THEN
        RAISE EXCEPTION 'A calendar-event player snapshot requires a linked calendar event';
      END IF;
    ELSIF NEW.calendar_event_player_id IS NOT NULL
          AND NEW.calendar_event_player_id IS DISTINCT FROM OLD.calendar_event_player_id THEN
      RAISE EXCEPTION 'A calendar-event player snapshot requires a linked calendar event';
    END IF;
    RETURN NEW;
  END IF;

  -- FOR SHARE conflicts with event UPDATE/DELETE and the lock is held until the
  -- report INSERT/restoration commits.  If an event edit wins first, this read
  -- observes and validates the edited row; if the report wins, the edit waits.
  SELECT
    e.id,
    e.event_type,
    e.event_date,
    e.status,
    e.participation_status,
    e.player_id,
    e.goalkeeper_name,
    e.assigned_mentor_id
  INTO linked_event
  FROM public.calendar_events AS e
  WHERE e.id = NEW.calendar_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That scheduled Match event no longer exists';
  END IF;

  IF linked_event.event_type IS DISTINCT FROM 'Match' THEN
    RAISE EXCEPTION 'A linked Match Report requires a Match calendar event';
  END IF;
  IF linked_event.status IS DISTINCT FROM 'scheduled' THEN
    RAISE EXCEPTION 'A cancelled Match event cannot receive a Match Report';
  END IF;
  IF linked_event.participation_status IS DISTINCT FROM 'played' THEN
    RAISE EXCEPTION 'Confirm that this goalkeeper Played before saving a linked Match Report';
  END IF;
  IF linked_event.player_id IS NULL
     OR linked_event.goalkeeper_name IS NULL
     OR btrim(linked_event.goalkeeper_name) = '' THEN
    RAISE EXCEPTION 'The linked Match event has no canonical goalkeeper';
  END IF;

  -- New linked reports must bring the player id read during application
  -- preflight.  A pre-migration tombstone has no such value, so an explicit
  -- restoration captures the currently locked and fully validated player once.
  IF NEW.calendar_event_player_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'A linked Match Report requires the expected calendar-event player';
    END IF;
    NEW.calendar_event_player_id := linked_event.player_id;
  END IF;

  IF NEW.calendar_event_player_id IS DISTINCT FROM linked_event.player_id THEN
    RAISE EXCEPTION 'The Match event goalkeeper changed before the report was saved';
  END IF;
  IF lower(regexp_replace(btrim(NEW.goalkeeper), '[[:space:]]+', ' ', 'g'))
     IS DISTINCT FROM
     lower(regexp_replace(btrim(linked_event.goalkeeper_name), '[[:space:]]+', ' ', 'g')) THEN
    RAISE EXCEPTION 'The Match event goalkeeper name changed before the report was saved';
  END IF;
  IF NEW.match_date IS DISTINCT FROM linked_event.event_date THEN
    RAISE EXCEPTION 'The Match event date changed before the report was saved';
  END IF;

  IF NEW.submitted_by IS NOT NULL THEN
    -- Lock the submitter's current role rows alongside the event row.  A role
    -- revocation that wins first is observed here; if this insert wins first,
    -- the revocation waits until the report transaction has committed.
    FOR submitter_role IN
      SELECT ur.role
      FROM public.user_roles AS ur
      WHERE ur.user_id = NEW.submitted_by
      FOR SHARE
    LOOP
      submitter_can_write := submitter_can_write OR submitter_role IN (
        'mentor'::public.app_role,
        'mentor_manager'::public.app_role,
        'super_admin'::public.app_role
      );
      submitter_can_write_any := submitter_can_write_any OR submitter_role IN (
        'mentor_manager'::public.app_role,
        'admin'::public.app_role,
        'super_admin'::public.app_role
      );
    END LOOP;
  END IF;

  IF NOT submitter_can_write THEN
    RAISE EXCEPTION 'The report submitter no longer has permission to submit Match Reports';
  END IF;
  IF linked_event.assigned_mentor_id IS DISTINCT FROM NEW.submitted_by
     AND NOT submitter_can_write_any THEN
    RAISE EXCEPTION 'That Match event is assigned to another mentor';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.match_reports_guard_event_snapshot()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS match_reports_guard_event_snapshot
  ON public.match_reports_cache;
CREATE TRIGGER match_reports_guard_event_snapshot
  BEFORE INSERT OR UPDATE ON public.match_reports_cache
  FOR EACH ROW EXECUTE FUNCTION public.match_reports_guard_event_snapshot();

-- Protect the other ordering of the same race.  If the report insert commits
-- first, a later calendar edit must not make that report appear to complete a
-- different goalkeeper's fixture.  Cosmetic/scheduling notes, assignment,
-- status and participation corrections remain governed by their existing
-- business rules; only report identity is frozen while an active report is
-- linked.
CREATE OR REPLACE FUNCTION public.calendar_events_guard_linked_match_report_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.event_type IS NOT DISTINCT FROM OLD.event_type
     AND NEW.event_date IS NOT DISTINCT FROM OLD.event_date
     AND NEW.player_id IS NOT DISTINCT FROM OLD.player_id
     AND NEW.goalkeeper_name IS NOT DISTINCT FROM OLD.goalkeeper_name THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_reports_cache AS report
    WHERE report.calendar_event_id = OLD.id
      AND report.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'This Match has an active report. Remove that report before changing its goalkeeper, date, or event type';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.calendar_events_guard_linked_match_report_identity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calendar_events_guard_linked_match_report_identity
  ON public.calendar_events;
CREATE TRIGGER calendar_events_guard_linked_match_report_identity
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.calendar_events_guard_linked_match_report_identity();

-- If an event moves away from an obligation and later returns to it, re-open
-- only the previously validated reminder for that exact obligation. Legacy NULL
-- reminders are never rearmed. This remains safe before the deadline because
-- the UI marks only currently visible notification IDs as read.
CREATE OR REPLACE FUNCTION public.calendar_events_rearm_overdue_basis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_basis text;
  new_basis text;
BEGIN
  old_basis := CASE
    WHEN OLD.event_type = 'Match' AND OLD.participation_status = 'played'
      THEN 'match_played'
    WHEN OLD.event_type IN ('Training Ground Visit', 'Coffee Catch-up')
      THEN 'interaction'
    ELSE NULL
  END;
  new_basis := CASE
    WHEN NEW.event_type = 'Match' AND NEW.participation_status = 'played'
      THEN 'match_played'
    WHEN NEW.event_type IN ('Training Ground Visit', 'Coffee Catch-up')
      THEN 'interaction'
    ELSE NULL
  END;

  IF new_basis IS NOT NULL AND new_basis IS DISTINCT FROM old_basis THEN
    UPDATE public.notifications
    SET read_at = NULL
    WHERE calendar_event_id = NEW.id
      AND kind = 'follow_up_overdue'
      AND follow_up_basis = new_basis
      AND read_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.calendar_events_rearm_overdue_basis()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calendar_events_rearm_overdue_basis
  ON public.calendar_events;
CREATE TRIGGER calendar_events_rearm_overdue_basis
  AFTER UPDATE OF event_type, participation_status ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.calendar_events_rearm_overdue_basis();
