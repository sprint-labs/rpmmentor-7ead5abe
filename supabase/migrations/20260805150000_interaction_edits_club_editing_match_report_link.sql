-- Interaction editing, authorised club editing, and Match Report ↔ interaction linkage.
--
-- Every statement is idempotent so it is safe to replay against a database whose
-- migration ledger has drifted from the repository.
--
-- Scope, deliberately narrow:
--   1. interactions  — add `updated_by` + `match_report_id`, a database-level
--                      uniqueness guarantee per Match Report, an UPDATE policy,
--                      immutability guards and an audit trail.
--   2. players       — allow mentor_manager/admin to correct `current_club`
--                      only, preserving the existing super_admin full access.
--
-- No DELETE policy is added anywhere. No existing policy is widened.

-- ---------------------------------------------------------------------------
-- 1. interactions: new columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Durable reference back to the Match Report that produced this interaction.
-- NULL for manually logged interactions.
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS match_report_id text;

COMMENT ON COLUMN public.interactions.match_report_id IS
  'Originating Match Report identity (match_reports_cache.report_id). NULL for manually logged interactions.';
COMMENT ON COLUMN public.interactions.updated_by IS
  'profiles.id of whoever last edited this interaction. NULL if never edited.';

-- Database-level idempotency for change #1: a Match Report can produce at most
-- one interaction, no matter how many times submission is retried, refreshed or
-- replayed. This is enforced by Postgres, not by application logic.
CREATE UNIQUE INDEX IF NOT EXISTS interactions_match_report_id_key
  ON public.interactions (match_report_id)
  WHERE match_report_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. interactions: immutability guard
--
-- The UPDATE policy below lets management roles correct other people's
-- interactions. This trigger makes sure an edit can never re-assign authorship
-- or rewrite creation time, and never silently changes the Match Report link.
-- ---------------------------------------------------------------------------

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
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.interactions_guard_immutable_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS interactions_guard_immutable ON public.interactions;
CREATE TRIGGER interactions_guard_immutable
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.interactions_guard_immutable_columns();

-- ---------------------------------------------------------------------------
-- 3. interactions: least-privilege UPDATE policy
--
-- Author may correct their own interaction; mentor_manager/admin/super_admin may
-- correct any. No DELETE policy is added — interactions remain undeletable from
-- the client.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS interactions_update_authorised ON public.interactions;
CREATE POLICY interactions_update_authorised
  ON public.interactions
  FOR UPDATE
  TO authenticated
  USING (
    (
      mentor_id = auth.uid()
      AND (
        public.has_role(auth.uid(), 'mentor'::app_role)
        OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (
      mentor_id = auth.uid()
      AND (
        public.has_role(auth.uid(), 'mentor'::app_role)
        OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ---------------------------------------------------------------------------
-- 4. interaction audit history
--
-- No audit mechanism existed for interactions, so this records the minimum
-- needed to answer "who changed this, when, and from what to what".
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.interaction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.interactions(id) ON DELETE CASCADE,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  before jsonb,
  after jsonb
);

CREATE INDEX IF NOT EXISTS interaction_audit_interaction_id_idx
  ON public.interaction_audit (interaction_id, changed_at DESC);

ALTER TABLE public.interaction_audit ENABLE ROW LEVEL SECURITY;

-- Readable by the interaction's author and by management roles; never writable
-- from the client (only the SECURITY DEFINER trigger below writes to it).
DROP POLICY IF EXISTS interaction_audit_select_scoped ON public.interaction_audit;
CREATE POLICY interaction_audit_select_scoped
  ON public.interaction_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.id = interaction_audit.interaction_id
        AND i.mentor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS interaction_audit_no_client_insert ON public.interaction_audit;
CREATE POLICY interaction_audit_no_client_insert
  ON public.interaction_audit FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS interaction_audit_no_client_update ON public.interaction_audit;
CREATE POLICY interaction_audit_no_client_update
  ON public.interaction_audit FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS interaction_audit_no_client_delete ON public.interaction_audit;
CREATE POLICY interaction_audit_no_client_delete
  ON public.interaction_audit FOR DELETE TO anon, authenticated USING (false);

-- SECURITY DEFINER so the audit row is written even though clients hold no
-- INSERT privilege on the audit table.
CREATE OR REPLACE FUNCTION public.interactions_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audited_columns text[] := ARRAY[
    'goalkeeper_name', 'player_id', 'gk_slug', 'interaction_type',
    'club', 'occurred_at', 'notes', 'outcome', 'follow_up'
  ];
  before_doc jsonb;
  after_doc jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.interaction_audit (interaction_id, changed_by, action, before, after)
    VALUES (
      NEW.id,
      NEW.mentor_id,
      'insert',
      NULL,
      (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY (audited_columns))
    );
    RETURN NEW;
  END IF;

  before_doc := (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY (audited_columns));
  after_doc  := (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY (audited_columns));

  -- Only record genuine content changes.
  IF before_doc IS DISTINCT FROM after_doc THEN
    INSERT INTO public.interaction_audit (interaction_id, changed_by, action, before, after)
    VALUES (NEW.id, COALESCE(NEW.updated_by, auth.uid()), 'update', before_doc, after_doc);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.interactions_write_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS interactions_audit ON public.interactions;
CREATE TRIGGER interactions_audit
  AFTER INSERT OR UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.interactions_write_audit();

-- ---------------------------------------------------------------------------
-- 5. players: authorised club correction
--
-- Change #2. `Super admins manage players` (FOR ALL) is left exactly as it is,
-- so existing Super Admin access is preserved. This adds a *separate*, narrower
-- UPDATE path for mentor_manager and admin — the roles held by David Rouse and
-- Rich Lee respectively. Granting the same capability to anyone else later is a
-- single `user_roles` insert with no code or policy change.
--
-- `mentor` is deliberately NOT included.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS players_update_club_authorised ON public.players;
CREATE POLICY players_update_club_authorised
  ON public.players
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- RLS cannot express column-level permissions, so this trigger keeps the new
-- policy honest: a non-super-admin may only move `current_club`. Any attempt to
-- edit another column through that policy is rejected by the database.
CREATE OR REPLACE FUNCTION public.players_guard_club_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.players_guard_club_only_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS players_guard_club_only ON public.players;
CREATE TRIGGER players_guard_club_only
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_guard_club_only_update();
