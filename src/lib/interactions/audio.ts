/**
 * Saving an interaction's voice recording.
 *
 * Two steps have to succeed for a recording to be durable: the audio has to
 * reach storage as a `media_assets` row, and that row has to be linked to the
 * interaction. Each can fail on its own, so this module keeps them separable
 * and reports exactly which one failed.
 *
 * The whole point of the result carrying `mediaId` on failure is retry safety:
 * an upload that succeeded is never repeated, so retrying a failed LINK cannot
 * create a second copy of the recording.
 */

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

/** A recording captured by the voice recorder, held in form state until saved. */
export interface InteractionRecording {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

export type PersistInteractionAudioResult =
  | { ok: true; mediaId: string }
  /** `mediaId` is set when the upload succeeded and only the link failed. */
  | { ok: false; message: string; mediaId: string | null };

export function interactionAudioFileName(mimeType: string, now: Date = new Date()): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() || "audio/webm";
  const ext = AUDIO_EXTENSION_BY_MIME[base] ?? "webm";
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `interaction-voice-note-${stamp}.${ext}`;
}

export function interactionAudioTitle(goalkeeperName: string, occurredAt: string): string {
  return `Voice note — ${goalkeeperName} · ${occurredAt}`;
}

export function interactionAudioNotes(durationSec: number): string {
  const seconds = Math.max(0, Math.round(durationSec));
  return `Voice note (${seconds}s) recorded while logging an interaction.`;
}

/**
 * Upload the recording if it is not already uploaded, then link it.
 *
 * Never throws — the interaction is already saved by the time this runs, so a
 * failure must be reported as a partial result rather than being turned into
 * "the interaction was not saved".
 *
 * @param uploadedMediaId media asset created by a previous attempt, if any.
 *   Pass it back in on retry so the recording is uploaded at most once.
 */
export async function persistInteractionAudio(deps: {
  upload: () => Promise<string>;
  link: (mediaId: string) => Promise<void>;
  uploadedMediaId?: string | null;
}): Promise<PersistInteractionAudioResult> {
  let mediaId = deps.uploadedMediaId ?? null;

  if (!mediaId) {
    try {
      mediaId = await deps.upload();
    } catch (error) {
      return {
        ok: false,
        message: messageOf(error, "The recording could not be uploaded."),
        mediaId: null,
      };
    }
    if (!mediaId) {
      return {
        ok: false,
        message: "The recording could not be confirmed as uploaded.",
        mediaId: null,
      };
    }
  }

  try {
    await deps.link(mediaId);
  } catch (error) {
    // The upload stands. Handing the id back is what stops a retry duplicating it.
    return {
      ok: false,
      message: messageOf(error, "The recording could not be linked to this interaction."),
      mediaId,
    };
  }

  return { ok: true, mediaId };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
