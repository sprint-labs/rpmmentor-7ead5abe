-- Low-risk advisor maintenance: cover every currently unindexed foreign key.
-- These indexes improve parent-row updates/deletes and common relationship
-- lookups without changing any product behaviour or row visibility.

CREATE INDEX IF NOT EXISTS announcement_reads_user_id_idx
  ON public.announcement_reads (user_id);

CREATE INDEX IF NOT EXISTS announcements_created_by_idx
  ON public.announcements (created_by);

CREATE INDEX IF NOT EXISTS calendar_events_cancelled_by_idx
  ON public.calendar_events (cancelled_by);

CREATE INDEX IF NOT EXISTS calendar_events_created_by_idx
  ON public.calendar_events (created_by);

CREATE INDEX IF NOT EXISTS calendar_events_follow_up_waived_by_idx
  ON public.calendar_events (follow_up_waived_by);

CREATE INDEX IF NOT EXISTS interaction_media_attached_by_idx
  ON public.interaction_media (attached_by);

CREATE INDEX IF NOT EXISTS interactions_updated_by_idx
  ON public.interactions (updated_by);

CREATE INDEX IF NOT EXISTS notifications_calendar_event_id_idx
  ON public.notifications (calendar_event_id);

CREATE INDEX IF NOT EXISTS notifications_created_by_idx
  ON public.notifications (created_by);

CREATE INDEX IF NOT EXISTS report_attachments_media_id_idx
  ON public.report_attachments (media_id);

CREATE INDEX IF NOT EXISTS support_messages_author_id_idx
  ON public.support_messages (author_id);

-- submission_key already owns a UNIQUE constraint-backed index. The older
-- hand-written unique index is byte-for-byte identical and only adds write
-- amplification, so retain the constraint index and remove the duplicate.
DROP INDEX IF EXISTS public.match_report_submissions_key_uidx;
