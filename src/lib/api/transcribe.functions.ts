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
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI service is not configured." };
    }

    const userText = data.context?.trim()
      ? `Context from the mentor: ${data.context.trim()}\n\nTranscribe the handwritten notes in this image.`
      : "Transcribe the handwritten notes in this image.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
      if (res.status === 429) return { ok: false as const, error: "Rate limit reached — please try again in a moment." };
      if (res.status === 402) return { ok: false as const, error: "AI credits exhausted — add credits in your workspace settings." };
      const detail = await res.text().catch(() => "");
      console.error("transcribeNotes gateway error", res.status, detail);
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
  if (bytes.byteLength < MIN_AUDIO_BYTES || bytes.byteLength > MAX_AUDIO_BYTES) return null;
  if (bytes.toString("base64").replace(/=+$/u, "") !== compact.replace(/=+$/u, "")) return null;
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
  .inputValidator((data: unknown) => data as z.infer<typeof VoiceInputSchema>)
  .handler(async ({ data }) => {
    const parsed = VoiceInputSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false as const, error: "Invalid audio payload." };
    }
    const payload = parsed.data;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI service is not configured." };

    const mime = normalizeAudioMimeType(payload.mimeType);
    if (!mime) return { ok: false as const, error: "Unsupported audio type." };

    const bytes = decodeBase64Audio(payload.audioBase64);
    if (!bytes) return { ok: false as const, error: "Invalid audio payload." };
    if (bytes.byteLength < MIN_AUDIO_BYTES) {
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
      if (res.status === 429) return { ok: false as const, error: "Rate limit reached — try again in a moment." };
      if (res.status === 402) return { ok: false as const, error: "AI credits exhausted — add credits in workspace settings." };
      console.error("transcribeVoiceNote OpenAI error", res.status);
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
