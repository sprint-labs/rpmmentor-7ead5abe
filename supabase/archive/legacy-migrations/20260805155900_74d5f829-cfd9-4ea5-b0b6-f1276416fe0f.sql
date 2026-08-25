GRANT DELETE ON public.interactions TO authenticated;

DROP POLICY IF EXISTS interactions_delete_authorised ON public.interactions;
CREATE POLICY interactions_delete_authorised
ON public.interactions
FOR DELETE
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
);