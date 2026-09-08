/**
 * Shared wording for a failed voice-note transcription.
 *
 * Lives outside the component so the message can be unit-tested and reused
 * without exporting a non-component from a component module.
 */

export const RECORDING_SAFE_SUFFIX =
  "Your recording is still available — retry, or save it without a transcript.";

export const TRANSCRIPTION_FAILURE_MESSAGE = `We could not process this audio recording. ${RECORDING_SAFE_SUFFIX}`;

/**
 * Show the reason the server actually gave. Replacing every failure with one
 * generic sentence is what made a missing OPENAI_API_KEY, an exhausted OpenAI
 * quota and a rejected audio format all look identical on screen — and none of
 * them distinguishable in support. The reassurance is kept as a suffix.
 */
export function transcriptionFailureMessage(reason?: string | null): string {
  const trimmed = reason?.trim();
  return trimmed ? `${trimmed} ${RECORDING_SAFE_SUFFIX}` : TRANSCRIPTION_FAILURE_MESSAGE;
}
