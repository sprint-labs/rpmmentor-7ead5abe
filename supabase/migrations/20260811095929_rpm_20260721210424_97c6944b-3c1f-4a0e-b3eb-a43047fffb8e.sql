
CREATE TABLE public.password_change_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  actor_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('self_change','admin_reset','recovery_reset')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_change_audit_user_id_idx ON public.password_change_audit(user_id);
CREATE INDEX password_change_audit_created_at_idx ON public.password_change_audit(created_at DESC);

GRANT SELECT ON public.password_change_audit TO authenticated;
GRANT ALL ON public.password_change_audit TO service_role;

ALTER TABLE public.password_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view password audit"
  ON public.password_change_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
