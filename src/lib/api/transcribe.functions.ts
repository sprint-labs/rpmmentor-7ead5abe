import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  // data URL: "data:image/jpeg;base64,...."
  imageDataUrl: z
    .string()
    .min(32)
    .max(15_000_000)
    .regex(/^data:image\/(png|jpeg|jpg|webp|heic|heif);base64,/i, "Must be a base64 image data URL"),
  context: z.string().max(500).optional(),
});

/**
 * OpenAI answers 429 both for genuine rate limiting and for `insufficient_quota`
 * — an account with no credit left. "Rate limit reached" alone sent people off
 * to wait for a limit that was never going to clear, so name both causes.
 */
const OPENAI_QUOTA_MESSAGE =
  "OpenAI rate limit or quota reached — try again shortly, and check the OpenAI account's billing if it persists.";

/** Names the variable, so an unset key is diagnosable from the screen alone. */
const MISSING_KEY_MESSAGE =
  "AI service is not configured — OPENAI_API_KEY is not set for this environment.";

const SYSTEM_PROMPT = `You are an OCR and handwriting transcription assistant for RPM, a goalkeeper performance management organisation.
You receive a photo of handwritten notes taken by a goalkeeper mentor during a session, match or meeting.

Your job:
- Transcribe the handwriting verbatim into clean, well-punctuated English.
- Preserve bullets, dashes and numbered lists as Markdown bullets ("- " or "1. ").
- Preserve headings the mentor underlined or wrote in capitals.
- Preserve player names, club names, drill names, scores and dates exactly as written.
- If a word is illegible, write [illegible] in place of guessing.
- Do not add commentary, summary, or analysis — only the transcription.
- If the image clearly contains no handwriting, reply with exactly: NO_HANDWRITING_DETECTED`;

export const transcribeNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("transcribeNotes: OPENAI_API_KEY is not set in this environment");
      return { ok: false as const, error: MISSING_KEY_MESSAGE };
    }

    const userText = data.context?.trim()
      ? `Context from the mentor: ${data.context.trim()}\n\nTranscribe the handwritten notes in this image.`
      : "Transcribe the handwritten notes in this image.";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      // Log first, return second. Returning 429/402 before the log is what made
      // an unfunded OpenAI account (which answers 429 `insufficient_quota`)
      // invisible in the runtime logs.
      const detail = await res.text().catch(() => "");
      console.error("transcribeNotes OpenAI error", res.status, detail.slice(0, 500));
      if (res.status === 429) return { ok: false as const, error: OPENAI_QUOTA_MESSAGE };
      if (res.status === 402) return { ok: false as const, error: "AI credits exhausted — add credits in your workspace settings." };
      return { ok: false as const, error: `Transcription failed (${res.status}).` };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "No transcription returned." };
    if (text === "NO_HANDWRITING_DETECTED") {
      return { ok: false as const, error: "No handwritten notes detected in that image." };
    }
    return { ok: true as const, text };
  });

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

const MAX_AUDIO_BASE64_CHARS = 25_000_000;
const MAX_AUDIO_BYTES = Math.floor(MAX_AUDIO_BASE64_CHARS * 3 / 4);
const MIN_AUDIO_BYTES = 2048;

function normalizeAudioMimeType(input: string): string | null {
  const [rawBase, ...params] = input.split(";");
  const base = rawBase.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(AUDIO_EXT, base)) return null;

  for (const rawParam of params) {
    const param = rawParam.trim();
    if (!param) continue;
    const [key, ...valueParts] = param.split("=");
    const value = valueParts.join("=").trim().replace(/^"|"$/g, "");
    if (!/^[a-z0-9.+-]+$/i.test(key.trim())) return null;
    if (value && !/^[a-z0-9._,+-]+$/i.test(value)) return null;
  }

  return base;
}

function decodeBase64Audio(input: string): Buffer | null {
  const compact = input.trim().replace(/\s/g, "");
  if (!compact || compact.startsWith("data:") || compact.startsWith("blob:") || compact.includes(",")) return null;
  if (compact.length > MAX_AUDIO_BASE64_CHARS || compact.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const firstPadding = compact.indexOf("=");
  if (firstPadding !== -1 && !/^=+$/.test(compact.slice(firstPadding))) return null;

  const bytes = Buffer.from(compact, "base64");
  if (bytes.byteLength > MAX_AUDIO_BYTES) return null;
  if (bytes.toString("base64").replace(/=+$/u, "") !== compact.replace(/=+$/u, "")) return null;
  // The MIN_AUDIO_BYTES floor is enforced by the handler, not here: rejecting a
  // short clip as an undecodable payload told the mentor the wrong thing.
  return bytes;
}

function safeAudioFileName(fileName: string, mimeType: string): string {
  const ext = AUDIO_EXT[mimeType] ?? "webm";
  const stem = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "voice-note";
  return `${stem}.${ext}`;
}

const VoiceInputSchema = z.object({
  audioBase64: z
    .string()
    .min(64)
    .max(MAX_AUDIO_BASE64_CHARS),
  mimeType: z.string().min(5).max(120),
  fileName: z.string().min(1).max(120),
});

export const transcribeVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => data as z.infer<typeof VoiceInputSchema>)
  .handler(async ({ data }) => {
    // Every rejection below logs before it returns. Each one answers HTTP 200
    // with `ok: false`, so a silent return leaves no trace anywhere: not in the
    // status codes, not in the runtime errors, and not on the mentor's screen.
    const parsed = VoiceInputSchema.safeParse(data);
    if (!parsed.success) {
      console.error(
        "transcribeVoiceNote: payload failed validation",
        parsed.error.issues.map((i) => i.path.join(".")),
      );
      return { ok: false as const, error: "Invalid audio payload." };
    }
    const payload = parsed.data;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("transcribeVoiceNote: OPENAI_API_KEY is not set in this environment");
      return { ok: false as const, error: MISSING_KEY_MESSAGE };
    }

    const mime = normalizeAudioMimeType(payload.mimeType);
    if (!mime) {
      console.error("transcribeVoiceNote: unsupported audio type", payload.mimeType);
      return { ok: false as const, error: `Unsupported audio type (${payload.mimeType}).` };
    }

    // Only the payload's length is logged — never the audio itself.
    const bytes = decodeBase64Audio(payload.audioBase64);
    if (!bytes) {
      console.error(
        "transcribeVoiceNote: could not decode audio payload",
        payload.audioBase64.length,
      );
      return { ok: false as const, error: "Invalid audio payload." };
    }
    if (bytes.byteLength < MIN_AUDIO_BYTES) {
      console.error("transcribeVoiceNote: recording below the size floor", bytes.byteLength);
      return { ok: false as const, error: "Recording is too short — please try again." };
    }

    const fileName = safeAudioFileName(payload.fileName, mime);

    const form = new FormData();
    const audioArrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(audioArrayBuffer).set(bytes);
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("file", new Blob([audioArrayBuffer], { type: mime }), fileName);
    form.append("response_format", "json");
    form.append("include[]", "logprobs");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("transcribeVoiceNote OpenAI error", res.status, detail.slice(0, 500));
      if (res.status === 429) return { ok: false as const, error: OPENAI_QUOTA_MESSAGE };
      if (res.status === 402) return { ok: false as const, error: "AI credits exhausted — add credits in workspace settings." };
      return { ok: false as const, error: `Transcription failed (${res.status}).` };
    }

    const json = (await res.json()) as {
      text?: string;
      logprobs?: Array<{ token: string; logprob: number }>;
    };
    const text = json.text?.trim() ?? "";
    if (!text) return { ok: false as const, error: "No transcription returned." };

    const tokens = Array.isArray(json.logprobs)
      ? json.logprobs
          .filter((t) => typeof t?.token === "string" && typeof t?.logprob === "number")
          .map((t) => ({ token: t.token, confidence: Math.max(0, Math.min(1, Math.exp(t.logprob))) }))
      : [];
    const avgConfidence = tokens.length
      ? tokens.reduce((s, t) => s + t.confidence, 0) / tokens.length
      : null;

    return { ok: true as const, text, tokens, avgConfidence };
  });
