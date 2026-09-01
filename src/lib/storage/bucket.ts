/**
 * Storage bucket holding every uploaded media asset, including the voice
 * recordings attached to interactions.
 *
 * Declared on its own so server functions can reference it without importing
 * the browser Supabase client that `media-store` creates at module load.
 */
export const MEDIA_BUCKET = "gk-media";

/**
 * Private, tightly capped bucket reserved for Broadcast attachments. Keeping
 * this separate lets Storage enforce the 25 MiB and MIME limits without
 * reducing the 1 GiB ceiling required by other media workflows.
 */
export const ANNOUNCEMENT_MEDIA_BUCKET = "gk-broadcast-media";
