/**
 * Interaction ↔ voice recording linkage.
 *
 * The link is stored in `public.interaction_media` and is made with stable
 * database identifiers only: an `interactions.id` and a `media_assets.id`.
 * Nothing here matches on a goalkeeper name or a file name.
 *
 * Duplicate prevention is enforced by the DATABASE, not by this code: the
 * unique constraint on `(interaction_id, media_id)` means a retried attach
 * converges on the single existing row. This function is therefore safe to
 * call any number of times for the same recording.
 */
import type { InteractionAudioLink } from "@/lib/interactions/schema";

/** Postgres unique-violation. Means the link already exists — not an error. */
const UNIQUE_VIOLATION = "23505";

const LINK_COLUMNS = "id, interaction_id, media_id, created_at";

interface LinkRow {
  id: string;
  interaction_id: string;
  media_id: string;
  created_at: string;
}

function mapLink(row: LinkRow, created: boolean): InteractionAudioLink {
  return {
    id: row.id,
    interactionId: row.interaction_id,
    mediaId: row.media_id,
    createdAt: row.created_at,
    created,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (table: string) => any };

export interface LinkInteractionAudioInput {
  interactionId: string;
  mediaId: string;
  /** Authenticated caller, always derived server-side from the session. */
  userId: string;
  /** True for the roles that may already correct any interaction. */
  canManageAny: boolean;
}

/**
 * Attach an already-uploaded media asset to an interaction.
 *
 * Throws unless the link is confirmed present in the database afterwards, so a
 * caller can never present "Audio saved" without a real row behind it.
 * Authorisation is checked here for a clear message and again by the
 * `interaction_media_insert_authorised` RLS policy, which is what actually
 * stops one user attaching audio to another user's interaction.
 */
export async function linkInteractionAudio(
  db: Db,
  input: LinkInteractionAudioInput,
): Promise<InteractionAudioLink> {
  const { data: interaction, error: loadError } = await db
    .from("interactions")
    .select("id, mentor_id")
    .eq("id", input.interactionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!interaction) throw new Error("That interaction no longer exists.");

  const isAuthor = interaction.mentor_id === input.userId;
  if (!isAuthor && !input.canManageAny) {
    throw new Error("You do not have permission to attach audio to this interaction.");
  }

  const readExisting = () =>
    db
      .from("interaction_media")
      .select(LINK_COLUMNS)
      .eq("interaction_id", input.interactionId)
      .eq("media_id", input.mediaId)
      .maybeSingle();

  const inserted = await db
    .from("interaction_media")
    .insert({
      interaction_id: input.interactionId,
      media_id: input.mediaId,
      attached_by: input.userId,
    })
    .select(LINK_COLUMNS)
    .maybeSingle();

  if (inserted.error) {
    // Already attached by an earlier attempt. The database did its job; read
    // the existing row back and report it as the same, single link.
    if (inserted.error.code === UNIQUE_VIOLATION) {
      const existing = await readExisting();
      if (!existing.error && existing.data) return mapLink(existing.data, false);
    }
    throw new Error(inserted.error.message);
  }
  if (inserted.data) return mapLink(inserted.data, true);

  // A zero-row insert means RLS refused it. Never report success unconfirmed.
  const existing = await readExisting();
  if (!existing.error && existing.data) return mapLink(existing.data, false);
  throw new Error("The recording could not be confirmed as linked to this interaction.");
}
