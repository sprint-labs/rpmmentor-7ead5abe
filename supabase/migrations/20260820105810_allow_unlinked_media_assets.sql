-- Clips may be uploaded to the central media repository before a goalkeeper is
-- explicitly linked. Existing rows and storage object paths are unchanged.
ALTER TABLE public.media_assets
  ALTER COLUMN gk_id DROP NOT NULL;

COMMENT ON COLUMN public.media_assets.gk_id IS
  'Optional goalkeeper grouping key. New explicit links use canonical public.players.id; historical rows may contain legacy gk-* slugs; NULL means unlinked central-library media.';
