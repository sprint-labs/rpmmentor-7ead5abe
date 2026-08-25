BEGIN;
-- public.block_purged_demo_interactions(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.block_purged_demo_interactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.purged_demo_records
    WHERE table_name = 'interactions'
      AND fingerprint = public.interaction_demo_fingerprint(NEW.goalkeeper_name, NEW.occurred_at, NEW.notes)
  ) THEN
    RAISE EXCEPTION 'This record was permanently removed as demo data and cannot be re-created';
  END IF;
  RETURN NEW;
END;
$function$

;

-- public.calendar_events_write_audit(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.calendar_events_write_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

;

-- public.handle_new_user(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (id, email, name, initials, title, mentor_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(meta->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(meta->>'initials', upper(substring(COALESCE(meta->>'name', NEW.email) from 1 for 2))),
    COALESCE(meta->>'title', ''),
    meta->>'mentor_id'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$

;

-- public.has_role(_user_id uuid, _role app_role); security_definer=false; config=search_path=public
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$function$

;

-- public.interaction_demo_fingerprint(_goalkeeper_name text, _occurred_at date, _notes text); security_definer=false; config=search_path=public
CREATE OR REPLACE FUNCTION public.interaction_demo_fingerprint(_goalkeeper_name text, _occurred_at date, _notes text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT md5(
    lower(btrim(coalesce(_goalkeeper_name, ''))) || '|' ||
    coalesce(_occurred_at::text, '') || '|' ||
    lower(btrim(left(coalesce(_notes, ''), 120)))
  );
$function$

;

-- public.interactions_guard_immutable_columns(); security_definer=false; config=search_path=public
CREATE OR REPLACE FUNCTION public.interactions_guard_immutable_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$

;

-- public.interactions_write_audit(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.interactions_write_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

;

-- public.list_mentor_directory(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.list_mentor_directory()
 RETURNS TABLE(id uuid, name text, is_manager boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'mentor'::app_role)
    OR public.has_role((select auth.uid()), 'mentor_manager'::app_role)
    OR public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised to list the mentor directory'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.name, '') AS name,
    public.has_role(p.id, 'mentor_manager'::app_role) AS is_manager
  FROM public.profiles p
  WHERE public.has_role(p.id, 'mentor'::app_role)
     OR public.has_role(p.id, 'mentor_manager'::app_role)
  ORDER BY COALESCE(p.name, '');
END;
$function$

;

-- public.match_report_submissions_status_check(); security_definer=false; config=search_path=public
CREATE OR REPLACE FUNCTION public.match_report_submissions_status_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending','succeeded','ambiguous','failed') THEN
    RAISE EXCEPTION 'invalid submission status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$

;

-- public.notifications_guard_read_state_only(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.notifications_guard_read_state_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) - 'read_at' IS DISTINCT FROM to_jsonb(OLD) - 'read_at' THEN
    RAISE EXCEPTION 'Only read_at may be updated on a notification';
  END IF;
  RETURN NEW;
END;
$function$

;

-- public.players_guard_club_only_update(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.players_guard_club_only_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Server-side jobs (service_role) and super admins keep full access.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF to_jsonb(NEW) - 'current_club' - 'updated_at'
     IS DISTINCT FROM
     to_jsonb(OLD) - 'current_club' - 'updated_at' THEN
    RAISE EXCEPTION 'Only current_club may be updated by this role';
  END IF;

  RETURN NEW;
END;
$function$

;

-- public.players_guard_deletion_metadata(); security_definer=false; config=search_path=public
CREATE OR REPLACE FUNCTION public.players_guard_deletion_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$

;

-- public.players_prevent_client_hard_delete(); security_definer=false; config=search_path=public
CREATE OR REPLACE FUNCTION public.players_prevent_client_hard_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Player records must be archived, not permanently deleted';
  END IF;
  RETURN OLD;
END;
$function$

;

-- public.players_set_tier_effective_from(); security_definer=false; config=search_path=""
CREATE OR REPLACE FUNCTION public.players_set_tier_effective_from()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.tier is not null and new.tier_effective_from is null then
      new.tier_effective_from := current_date;
    end if;
  elsif new.tier is distinct from old.tier
    and new.tier_effective_from is not distinct from old.tier_effective_from then
    new.tier_effective_from := current_date;
  end if;
  return new;
end;
$function$

;

-- public.set_updated_at(); security_definer=false; config=search_path=public
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$

;

-- public.support_messages_after_insert(); security_definer=true; config=search_path=public
CREATE OR REPLACE FUNCTION public.support_messages_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

;

-- public.rpm_season_start(d date); security_definer=false; config=search_path=""
CREATE OR REPLACE FUNCTION public.rpm_season_start(d date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when d >= make_date(extract(year from d)::int, 8, 14)
      then make_date(extract(year from d)::int, 8, 14)
    else make_date(extract(year from d)::int - 1, 8, 14)
  end;
$function$

;

-- public.rpm_season_end(d date); security_definer=false; config=search_path=""
CREATE OR REPLACE FUNCTION public.rpm_season_end(d date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select make_date(extract(year from public.rpm_season_start(d))::int + 1, 5, 31);
$function$

;

-- public.rpm_recency_status(p_last_at date, p_interval_days integer, p_as_of date, p_amber_lead integer); security_definer=false; config=search_path=""
CREATE OR REPLACE FUNCTION public.rpm_recency_status(p_last_at date, p_interval_days integer, p_as_of date, p_amber_lead integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_last_at is null                                     then 'no_data'
    when p_last_at + p_interval_days <  p_as_of                then 'red'
    when p_last_at + p_interval_days <= p_as_of + p_amber_lead then 'amber'
    else 'green'
  end;
$function$

;

-- public.rpm_season_checkpoints(as_of date, target integer); security_definer=false; config=search_path=""
CREATE OR REPLACE FUNCTION public.rpm_season_checkpoints(as_of date, target integer DEFAULT 6)
 RETURNS TABLE(checkpoint_no integer, due_on date)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select
    n::integer,
    least(
      public.rpm_season_start(as_of)
        + round(
            (n::numeric * (public.rpm_season_end(as_of) - public.rpm_season_start(as_of)))
            / target
          )::integer,
      public.rpm_season_end(as_of)
    )
  from generate_series(1, target) as n;
$function$

;

-- public.rpm_tier3_status(p_season_count integer, p_binding_total integer, p_binding_due integer, p_next_due_at date, p_as_of date, p_is_off_season boolean, p_amber_lead integer); security_definer=false; config=search_path=""
CREATE OR REPLACE FUNCTION public.rpm_tier3_status(p_season_count integer, p_binding_total integer, p_binding_due integer, p_next_due_at date, p_as_of date, p_is_off_season boolean, p_amber_lead integer DEFAULT 14)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_is_off_season                          then 'off_season'
    when coalesce(p_binding_total, 0) = 0         then 'not_required'
    when p_season_count >= p_binding_total        then 'complete'
    when p_season_count <  p_binding_due          then 'red'
    when p_next_due_at is null                    then 'green'
    when p_next_due_at <= p_as_of + p_amber_lead  then 'amber'
    else 'green'
  end;
$function$

;

-- public.duty_of_care_at(as_of date); security_definer=false; config=search_path=""
CREATE OR REPLACE FUNCTION public.duty_of_care_at(as_of date)
 RETURNS TABLE(player_id uuid, full_name text, current_club text, tier text, tier_effective_from date, season_start date, season_end date, is_off_season boolean, interval_days integer, last_interaction_at date, season_count integer, period_target integer, checkpoints_due integer, next_checkpoint_no integer, next_due_at date, days_until_due integer, state text, rag_status text, status_label text, season_outcome text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with cfg as (
  select
    public.rpm_season_start(as_of) as season_start,
    public.rpm_season_end(as_of)   as season_end,
    14                             as tier3_amber_lead
),
-- Verified against src/lib/mock-data.ts:609-614 on 2026-08-24. The frontend
-- rule is `days > floor(interval * 0.75)`, so amber_lead encodes
-- interval - floor(interval * 0.75) - 1. Tier 1: 15 - 11 - 1 = 3.
-- Tier 2: 30 - 22 - 1 = 7. Do not refactor to the formula.
tier_cfg (tier_key, interval_days, amber_lead_days) as (
  values ('tier 1'::text, 15, 3),
         ('tier 2'::text, 30, 7)
),
qualifying as (
  select i.player_id, i.occurred_at
  from public.interactions i
  join public.interaction_types t
    on t.name = i.interaction_type
   and t.counts_as_live
  where i.deleted_at is null
    and i.player_id is not null
    and i.occurred_at <= as_of
),
last_any as (
  select q.player_id, max(q.occurred_at) as last_interaction_at
  from qualifying q group by q.player_id
),
pb as (
  select
    pl.id as player_id, pl.full_name, pl.current_club, pl.tier,
    lower(coalesce(nullif(btrim(pl.tier), ''), 'unassigned')) as tier_key,
    pl.tier_effective_from,
    greatest(c.season_start, coalesce(pl.tier_effective_from, c.season_start)) as effective_start,
    c.season_start, c.season_end, c.tier3_amber_lead,
    (as_of > c.season_end) as is_off_season
  from public.players pl
  cross join cfg c
  where pl.deleted_at is null
),
season_agg as (
  select pb.player_id, count(q.player_id)::integer as season_count
  from pb
  left join qualifying q
    on q.player_id     = pb.player_id
   and q.occurred_at  >= pb.effective_start
   and q.occurred_at  <= least(as_of, pb.season_end)
  group by pb.player_id
),
bind as (
  select pb.player_id, cp.due_on,
         row_number() over (partition by pb.player_id order by cp.due_on)::integer as rn
  from pb
  cross join public.rpm_season_checkpoints(as_of, 6) cp
  where cp.due_on >= pb.effective_start
),
bind_agg as (
  select b.player_id,
         count(*)::integer                                  as binding_total,
         count(*) filter (where b.due_on <= as_of)::integer  as binding_due
  from bind b group by b.player_id
),
resolved as (
  select
    pb.*,
    tc.interval_days,
    tc.amber_lead_days,
    la.last_interaction_at,
    sa.season_count,
    coalesce(ba.binding_total, 0) as binding_total,
    coalesce(ba.binding_due,   0) as binding_due,
    nx.due_on                     as next_due_at
  from pb
  join      season_agg sa on sa.player_id = pb.player_id
  left join tier_cfg   tc on tc.tier_key  = pb.tier_key
  left join last_any   la on la.player_id = pb.player_id
  left join bind_agg   ba on ba.player_id = pb.player_id
  left join bind       nx on nx.player_id = pb.player_id
                         and nx.rn        = sa.season_count + 1
),
scored as (
  select r.*,
    case
      when r.tier_key = 'tier 3' then
        public.rpm_tier3_status(
          r.season_count, r.binding_total, r.binding_due,
          r.next_due_at, as_of, r.is_off_season, r.tier3_amber_lead)
      when r.interval_days is not null then
        public.rpm_recency_status(
          r.last_interaction_at, r.interval_days, as_of, r.amber_lead_days)
      else 'not_required'
    end as state
  from resolved r
)
select
  s.player_id,
  s.full_name,
  s.current_club,
  s.tier,
  s.tier_effective_from,
  s.season_start,
  s.season_end,
  s.is_off_season,
  s.interval_days,
  s.last_interaction_at,
  s.season_count,
  case when s.tier_key = 'tier 3' then s.binding_total end                   as period_target,
  case when s.tier_key = 'tier 3' then s.binding_due   end                   as checkpoints_due,
  case when s.tier_key = 'tier 3' and s.season_count < s.binding_total
       then s.season_count + 1 end                                           as next_checkpoint_no,
  case when s.tier_key = 'tier 3' then s.next_due_at end                     as next_due_at,
  case when s.tier_key = 'tier 3' then (s.next_due_at - as_of)::integer end   as days_until_due,
  s.state,
  case s.state
    when 'red'      then 'red'
    when 'amber'    then 'amber'
    when 'green'    then 'green'
    when 'complete' then 'green'
    else 'none'
  end as rag_status,
  case s.state
    when 'off_season'    then 'Off season'
    when 'not_required'  then 'Not required'
    when 'no_data'       then 'Not enough data'
    when 'complete'      then 'Complete'
    when 'red'           then 'Overdue'
    when 'amber'         then 'Due soon'
    else 'Up to date'
  end as status_label,
  case
    when s.tier_key <> 'tier 3'                                       then null
    when s.binding_total > 0 and s.season_count >= s.binding_total    then 'met'
    when s.is_off_season                                              then 'not_met'
    else null
  end as season_outcome
from scored s;
$function$

;
COMMIT;
