BEGIN;
-- public.app_role
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'mentor_manager', 'mentor');

-- public.announcement_reads
CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.announcements
CREATE TABLE public.announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  starts_at timestamp with time zone DEFAULT now() NOT NULL,
  ends_at timestamp with time zone,
  active boolean DEFAULT true NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.calendar_event_audit
CREATE TABLE public.calendar_event_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  calendar_event_id uuid NOT NULL,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  action text NOT NULL,
  before_values jsonb,
  after_values jsonb
);

-- public.calendar_events
CREATE TABLE public.calendar_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  event_type text DEFAULT 'Other'::text NOT NULL,
  event_date date NOT NULL,
  start_time time without time zone,
  end_time time without time zone,
  location text,
  notes text DEFAULT ''::text NOT NULL,
  player_id uuid,
  goalkeeper_name text,
  created_by uuid NOT NULL,
  created_by_name text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  assigned_mentor_id uuid,
  assigned_mentor_name text DEFAULT ''::text NOT NULL,
  status text DEFAULT 'scheduled'::text NOT NULL,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text DEFAULT ''::text NOT NULL,
  follow_up_waived_at timestamp with time zone,
  follow_up_waived_by uuid,
  follow_up_waiver_reason text DEFAULT ''::text NOT NULL
);

-- public.dashboard_click_events
CREATE TABLE public.dashboard_click_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  source text NOT NULL,
  destination text NOT NULL,
  period_days integer,
  period_from timestamp with time zone,
  period_to timestamp with time zone,
  mentor_profile_id text,
  mentor_name text,
  effective_role text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.install_prompt_events
CREATE TABLE public.install_prompt_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  event text NOT NULL,
  surface text NOT NULL,
  platform text,
  browser text,
  user_agent text,
  declines integer DEFAULT 0 NOT NULL,
  failures integer DEFAULT 0 NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.interaction_audit
CREATE TABLE public.interaction_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  interaction_id uuid NOT NULL,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  action text NOT NULL,
  before_values jsonb,
  after_values jsonb
);

-- public.interaction_media
CREATE TABLE public.interaction_media (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  interaction_id uuid NOT NULL,
  media_id uuid NOT NULL,
  attached_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.interaction_types
CREATE TABLE public.interaction_types (
  name text NOT NULL,
  counts_as_live boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 100 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.interactions
CREATE TABLE public.interactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  mentor_id uuid NOT NULL,
  mentor_name text DEFAULT ''::text NOT NULL,
  player_id uuid,
  goalkeeper_name text NOT NULL,
  gk_slug text DEFAULT ''::text NOT NULL,
  interaction_type text NOT NULL,
  club text DEFAULT ''::text NOT NULL,
  occurred_at date NOT NULL,
  notes text DEFAULT ''::text NOT NULL,
  outcome text DEFAULT ''::text NOT NULL,
  follow_up text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  match_report_id text,
  calendar_event_id uuid,
  deleted_at timestamp with time zone,
  deleted_by uuid
);

-- public.match_report_cutover_state
CREATE TABLE public.match_report_cutover_state (
  id text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  run_id uuid,
  expected_sheet_count integer,
  sheet_digest text,
  reconciled_at timestamp with time zone,
  reconciled_by uuid,
  reconciled_by_label text,
  reconciliation jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.match_report_submissions
CREATE TABLE public.match_report_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  submission_key text NOT NULL,
  fingerprint text NOT NULL,
  goalkeeper text NOT NULL,
  team text DEFAULT ''::text NOT NULL,
  opponent text DEFAULT ''::text NOT NULL,
  match_date date,
  report_id text,
  sheet_row_index integer,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'succeeded'::text NOT NULL,
  confirmed_duplicate boolean DEFAULT false NOT NULL,
  reserved_at timestamp with time zone DEFAULT now() NOT NULL,
  report_uid text
);

-- public.match_reports_cache
CREATE TABLE public.match_reports_cache (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_id text NOT NULL,
  row_index integer,
  goalkeeper text NOT NULL,
  coach text NOT NULL,
  team text,
  opponent text,
  match_date date,
  protect_goal smallint,
  protect_space smallint,
  protect_air smallint,
  control_play smallint,
  change_play smallint,
  psych smallint,
  physical smallint,
  average numeric(3,1),
  comments text,
  synced_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  competition text,
  source text,
  legacy_report_id text,
  submitted_at timestamp with time zone,
  submitted_by uuid,
  submission_key text,
  deleted_at timestamp with time zone,
  calendar_event_id uuid
);

-- public.media_assets
CREATE TABLE public.media_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  gk_id text,
  title text NOT NULL,
  notes text,
  media_type text NOT NULL,
  mime_type text,
  file_path text NOT NULL,
  file_size bigint,
  uploaded_by_id text,
  uploaded_by_name text,
  uploaded_by_role text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  rating_tags text[] DEFAULT '{}'::text[] NOT NULL,
  thumbnail_path text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.media_audit_log
CREATE TABLE public.media_audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  action text NOT NULL,
  media_id uuid,
  media_title text,
  gk_id text,
  actor_id text,
  actor_name text,
  actor_role text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- public.notifications
CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recipient_id uuid NOT NULL,
  calendar_event_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  link_path text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  read_at timestamp with time zone
);

-- public.password_change_audit
CREATE TABLE public.password_change_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.players
CREATE TABLE public.players (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  current_club text DEFAULT ''::text NOT NULL,
  parent_club text,
  on_loan boolean DEFAULT false NOT NULL,
  league text DEFAULT ''::text NOT NULL,
  nationality text DEFAULT ''::text NOT NULL,
  instagram_url text,
  contract_until text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tier text,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  tier_effective_from date
);

-- public.profiles
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  name text DEFAULT ''::text NOT NULL,
  initials text DEFAULT ''::text NOT NULL,
  title text DEFAULT ''::text NOT NULL,
  mentor_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.purged_demo_records
CREATE TABLE public.purged_demo_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  table_name text NOT NULL,
  fingerprint text NOT NULL,
  reason text DEFAULT 'seeded demo data'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.report_attachments
CREATE TABLE public.report_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_id text NOT NULL,
  media_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  attached_by_id text,
  attached_by_name text
);

-- public.support_messages
CREATE TABLE public.support_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  thread_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.support_threads
CREATE TABLE public.support_threads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kind text NOT NULL,
  subject text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  author_id uuid NOT NULL,
  page_path text DEFAULT ''::text NOT NULL,
  severity text DEFAULT 'medium'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_message_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.user_deletion_audit
CREATE TABLE public.user_deletion_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  deleted_user_id uuid NOT NULL,
  deleted_email text DEFAULT ''::text NOT NULL,
  deleted_name text DEFAULT ''::text NOT NULL,
  deleted_role text,
  actor_id uuid,
  actor_email text DEFAULT ''::text NOT NULL,
  actor_name text DEFAULT ''::text NOT NULL,
  affected_sections jsonb DEFAULT '[]'::jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- public.user_roles
CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMIT;
