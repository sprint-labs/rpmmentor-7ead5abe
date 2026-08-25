ALTER TABLE public.media_assets
  ALTER COLUMN gk_id DROP NOT NULL;

COMMENT ON COLUMN public.media_assets.gk_id IS
  'Optional goalkeeper grouping key. New explicit links use canonical public.players.id; historical rows may contain legacy gk-* slugs; NULL means unlinked central-library media.';
