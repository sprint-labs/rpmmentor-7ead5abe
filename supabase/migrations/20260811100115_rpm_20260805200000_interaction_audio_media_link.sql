-- Durable link between an interaction and the media asset holding its voice recording.
--
-- Before this, a voice note recorded while logging an interaction had nowhere to
-- live: `report_attachments` links media to a Match Report, and nothing linked
-- media to `public.interactions`. The audio was therefore only ever held in
-- browser memory and disappeared on refresh.
--
-- Scope is deliberately one table. No existing table, policy or grant is changed.
-- Every statement is idempotent so it is safe to replay against a database whose
-- migration ledger has drifted from the repository.

CREATE TABLE IF NOT EXISTS public.interaction_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.interactions(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  attached_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Database-level idempotency: re-attaching the same recording after a failed
  -- link converges on the single existing row instead of stacking duplicates.
  CONSTRAINT interaction_media_interaction_id_media_id_key UNIQUE (interaction_id, media_id)
);

COMMENT ON TABLE public.interaction_media IS
  'Links a media_assets row (e.g. an interaction voice recording) to the interaction it belongs to. Linkage is by primary key only — never by goalkeeper name or file name.';
COMMENT ON COLUMN public.interaction_media.attached_by IS
  'profiles.id of whoever attached the media. Enforced to equal auth.uid() on insert.';

CREATE INDEX IF NOT EXISTS interaction_media_interaction_id_idx
  ON public.interaction_media (interaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS interaction_media_media_id_idx
  ON public.interaction_media (media_id);

GRANT SELECT, INSERT ON public.interaction_media TO authenticated;
GRANT ALL ON public.interaction_media TO service_role;

ALTER TABLE public.interaction_media ENABLE ROW LEVEL SECURITY;

-- Readable by exactly whoever may read the parent interaction. The EXISTS
-- subquery is itself subject to `interactions_select_privileged`, so this can
-- never widen interaction visibility.
DROP POLICY IF EXISTS interaction_media_select_scoped ON public.interaction_media;
CREATE POLICY interaction_media_select_scoped
  ON public.interaction_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.id = interaction_media.interaction_id
    )
  );

-- Attachable only by the mentor who logged the interaction, or by the management
-- roles that may already correct any interaction. This is what stops one user
-- attaching audio to another user's interaction.
DROP POLICY IF EXISTS interaction_media_insert_authorised ON public.interaction_media;
CREATE POLICY interaction_media_insert_authorised
  ON public.interaction_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    attached_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.id = interaction_media.interaction_id
        AND (
          i.mentor_id = auth.uid()
          OR public.has_role(auth.uid(), 'mentor_manager'::app_role)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.media_assets m
      WHERE m.id = interaction_media.media_id
    )
  );

-- No UPDATE or DELETE policy: a link is immutable from the client, matching the
-- fact that interactions themselves cannot be deleted from the client.
DROP POLICY IF EXISTS interaction_media_no_client_update ON public.interaction_media;
CREATE POLICY interaction_media_no_client_update
  ON public.interaction_media FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS interaction_media_no_client_delete ON public.interaction_media;
CREATE POLICY interaction_media_no_client_delete
  ON public.interaction_media FOR DELETE TO anon, authenticated USING (false);
