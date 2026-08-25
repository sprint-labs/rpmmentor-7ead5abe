-- RLS policies for interactions and related records call has_role(...).
-- Authenticated API sessions must be able to execute that policy helper.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
