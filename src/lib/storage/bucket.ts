/**
 * Storage bucket holding every uploaded media asset, including the voice
 * recordings attached to interactions.
 *
 * Declared on its own so server functions can reference it without importing
 * the browser Supabase client that `media-store` creates at module load.
 */
export const MEDIA_BUCKET = "gk-media";
