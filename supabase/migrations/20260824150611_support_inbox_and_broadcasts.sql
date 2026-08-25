-- Support inbox + Super Admin broadcasts.
--
-- Additive and idempotent. Delivers support replies through the EXISTING
-- public.notifications table (SECURITY DEFINER trigger — do not widen
-- notifications_insert_authorised). Announcements are one row for everyone
-- with per-user read state in announcement_reads; no fan-out into notifications.
--
-- This file is NOT applied to production by this change. Apply the migration
-- before deploying the app code that depends on these tables.

-- ---------------------------------------------------------------------------
-- 1. Widen notifications.kind so support deliveries are legal
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'event_assigned',
    'event_updated',
    'event_unassigned',
    'event_cancelled',
    'follow_up_overdue',
    'support_thread_opened',
    'support_reply'
  ));

-- ---------------------------------------------------------------------------
-- 2. support_threads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page_path text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_threads_kind_check CHECK (kind IN ('bug', 'question')),
  CONSTRAINT support_threads_status_check CHECK (
    status IN ('open', 'waiting_on_admin', 'waiting_on_user', 'resolved')
  ),
  CONSTRAINT support_threads_subject_len CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT support_threads_severity_check CHECK (severity IN ('low', 'medium', 'high'))
);

COMMENT ON TABLE public.support_threads IS
  'One-to-one support threads (bug reports and questions). Mentors own their threads; Super Admin sees all.';

CREATE INDEX IF NOT EXISTS support_threads_author_last_message_idx
  ON public.support_threads (author_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS support_threads_status_last_message_idx
  ON public.support_threads (status, last_message_at DESC);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_threads_select_scoped ON public.support_threads;
CREATE POLICY support_threads_select_scoped
  ON public.support_threads
  FOR SELECT
  TO authenticated
  USING (
    author_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS support_threads_insert_own ON public.support_threads;
CREATE POLICY support_threads_insert_own
  ON public.support_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (author_id = (select auth.uid()));

DROP POLICY IF EXISTS support_threads_update_super_admin ON public.support_threads;
CREATE POLICY support_threads_update_super_admin
  ON public.support_threads
  FOR UPDATE
  TO authenticated
  USING (public.has_role((select auth.uid()), 'super_admin'::app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'super_admin'::app_role));

-- Authors may delete their own thread only as a create-path cleanup when the
-- first message insert fails. Super Admin does not need bulk delete in this slice.
DROP POLICY IF EXISTS support_threads_delete_own ON public.support_threads;
CREATE POLICY support_threads_delete_own
  ON public.support_threads
  FOR DELETE
  TO authenticated
  USING (author_id = (select auth.uid()));

DROP POLICY IF EXISTS support_threads_no_anon_delete ON public.support_threads;
CREATE POLICY support_threads_no_anon_delete
  ON public.support_threads FOR DELETE TO anon USING (false);

DROP TRIGGER IF EXISTS support_threads_set_updated_at ON public.support_threads;
CREATE TRIGGER support_threads_set_updated_at
  BEFORE UPDATE ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. support_messages (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);

COMMENT ON TABLE public.support_messages IS
  'Append-only messages in a support thread. Status bumps and bell notifications are written by a SECURITY DEFINER trigger.';

CREATE INDEX IF NOT EXISTS support_messages_thread_created_idx
  ON public.support_messages (thread_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_messages_select_scoped ON public.support_messages;
CREATE POLICY support_messages_select_scoped
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id = support_messages.thread_id
        AND t.author_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS support_messages_insert_scoped ON public.support_messages;
CREATE POLICY support_messages_insert_scoped
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (select auth.uid())
    AND (
      public.has_role((select auth.uid()), 'super_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.support_threads t
        WHERE t.id = support_messages.thread_id
          AND t.author_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS support_messages_no_client_update ON public.support_messages;
CREATE POLICY support_messages_no_client_update
  ON public.support_messages FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS support_messages_no_client_delete ON public.support_messages;
CREATE POLICY support_messages_no_client_delete
  ON public.support_messages FOR DELETE TO anon, authenticated USING (false);

-- ---------------------------------------------------------------------------
-- 4. announcements + announcement_reads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_kind_check CHECK (kind IN ('feature', 'info', 'incident', 'downtime')),
  CONSTRAINT announcements_title_len CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT announcements_body_len CHECK (char_length(body) <= 4000)
);

COMMENT ON TABLE public.announcements IS
  'One-to-everyone Super Admin broadcasts. Read state lives in announcement_reads; do not fan out into notifications.';

CREATE INDEX IF NOT EXISTS announcements_active_starts_idx
  ON public.announcements (active, starts_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_select_scoped ON public.announcements;
CREATE POLICY announcements_select_scoped
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'super_admin'::app_role)
    OR (
      active = true
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at > now())
    )
  );

DROP POLICY IF EXISTS announcements_insert_super_admin ON public.announcements;
CREATE POLICY announcements_insert_super_admin
  ON public.announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role((select auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS announcements_update_super_admin ON public.announcements;
CREATE POLICY announcements_update_super_admin
  ON public.announcements
  FOR UPDATE
  TO authenticated
  USING (public.has_role((select auth.uid()), 'super_admin'::app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS announcements_delete_super_admin ON public.announcements;
CREATE POLICY announcements_delete_super_admin
  ON public.announcements
  FOR DELETE
  TO authenticated
  USING (public.has_role((select auth.uid()), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

COMMENT ON TABLE public.announcement_reads IS
  'Per-user dismiss state for announcements. Dismissing an incident removes it from the bell, not the banner.';

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_reads_select_own ON public.announcement_reads;
CREATE POLICY announcement_reads_select_own
  ON public.announcement_reads
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS announcement_reads_insert_own ON public.announcement_reads;
CREATE POLICY announcement_reads_insert_own
  ON public.announcement_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS announcement_reads_no_client_update ON public.announcement_reads;
CREATE POLICY announcement_reads_no_client_update
  ON public.announcement_reads FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS announcement_reads_no_client_delete ON public.announcement_reads;
CREATE POLICY announcement_reads_no_client_delete
  ON public.announcement_reads FOR DELETE TO anon, authenticated USING (false);

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER: bump thread + write bell notifications
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.support_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread public.support_threads%ROWTYPE;
  msg_count integer;
  new_status text;
  notif_kind text;
  notif_title text;
  notif_body text;
  preview text;
  admin_id uuid;
BEGIN
  SELECT * INTO thread FROM public.support_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer INTO msg_count
  FROM public.support_messages
  WHERE thread_id = NEW.thread_id;

  IF NEW.author_id = thread.author_id THEN
    new_status := 'waiting_on_admin';
  ELSIF thread.status = 'resolved' THEN
    new_status := 'resolved';
  ELSE
    new_status := 'waiting_on_user';
  END IF;

  UPDATE public.support_threads
  SET
    last_message_at = NEW.created_at,
    updated_at = now(),
    status = new_status
  WHERE id = thread.id;

  preview := left(NEW.body, 160);

  IF NEW.author_id = thread.author_id THEN
    IF msg_count <= 1 THEN
      notif_kind := 'support_thread_opened';
      notif_title := CASE thread.kind
        WHEN 'bug' THEN 'New bug report'
        ELSE 'New question'
      END;
      notif_body := thread.subject || E'\n' || preview;
    ELSE
      notif_kind := 'support_reply';
      notif_title := 'Support reply';
      notif_body := preview;
    END IF;

    FOR admin_id IN
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role = 'super_admin'::app_role
        AND ur.user_id IS DISTINCT FROM NEW.author_id
    LOOP
      INSERT INTO public.notifications (
        recipient_id, calendar_event_id, kind, title, body, link_path, created_by
      ) VALUES (
        admin_id,
        NULL,
        notif_kind,
        notif_title,
        notif_body,
        '/support?thread=' || thread.id::text,
        NEW.author_id
      );
    END LOOP;
  ELSE
    INSERT INTO public.notifications (
      recipient_id, calendar_event_id, kind, title, body, link_path, created_by
    ) VALUES (
      thread.author_id,
      NULL,
      'support_reply',
      'Support reply',
      preview,
      '/support?thread=' || thread.id::text,
      NEW.author_id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.support_messages_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS support_messages_after_insert ON public.support_messages;
CREATE TRIGGER support_messages_after_insert
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_messages_after_insert();
