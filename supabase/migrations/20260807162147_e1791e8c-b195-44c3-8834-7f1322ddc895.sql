CREATE TABLE public.user_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id uuid NOT NULL,
  deleted_email text NOT NULL DEFAULT '',
  deleted_name text NOT NULL DEFAULT '',
  deleted_role text,
  actor_id uuid,
  actor_email text NOT NULL DEFAULT '',
  actor_name text NOT NULL DEFAULT '',
  affected_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_deletion_audit TO authenticated;
GRANT ALL ON public.user_deletion_audit TO service_role;

ALTER TABLE public.user_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view deletion audit"
ON public.user_deletion_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_user_deletion_audit_created_at ON public.user_deletion_audit (created_at DESC);