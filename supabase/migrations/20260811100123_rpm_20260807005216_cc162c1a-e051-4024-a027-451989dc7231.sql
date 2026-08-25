DROP POLICY IF EXISTS calendar_events_select_authenticated ON public.calendar_events;
CREATE POLICY calendar_events_select_authorised ON public.calendar_events
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor'::app_role)
  OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS interaction_media_select_scoped ON public.interaction_media;
CREATE POLICY interaction_media_select_authorised ON public.interaction_media
FOR SELECT TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'mentor'::app_role)
    OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  AND EXISTS (SELECT 1 FROM public.interactions i WHERE i.id = interaction_media.interaction_id)
);
