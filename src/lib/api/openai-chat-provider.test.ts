import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("handwritten OCR and rewrite/summary use OpenAI", () => {
  it("transcribeNotes calls OpenAI chat completions with gpt-4o-mini and the image data URL", () => {
    const src = source("./transcribe.functions.ts");
    const notesHandler = src.slice(
      src.indexOf("export const transcribeNotes"),
      src.indexOf("const AUDIO_EXT"),
    );
    expect(notesHandler).toContain("process.env.OPENAI_API_KEY");
    expect(notesHandler).not.toContain("LOVABLE_API_KEY");
    expect(notesHandler).toContain("https://api.openai.com/v1/chat/completions");
    expect(notesHandler).toContain("gpt-4o-mini");
    expect(notesHandler).toContain('type: "image_url"');
    expect(notesHandler).toContain("image_url: { url: data.imageDataUrl }");
    expect(notesHandler).not.toContain("ai.gateway.lovable.dev");
    expect(notesHandler).not.toContain("google/gemini-2.5-flash");
  });

  it("summarize/rewrite/analysis call OpenAI with json_object response_format", () => {
    const src = source("./summarize.functions.ts");
    const callGateway = src.slice(
      src.indexOf("async function callGateway"),
      src.indexOf("export const summarizeTranscript"),
    );
    expect(callGateway).toContain("process.env.OPENAI_API_KEY");
    expect(callGateway).not.toContain("LOVABLE_API_KEY");
    expect(callGateway).toContain("https://api.openai.com/v1/chat/completions");
    expect(callGateway).toContain("gpt-4o-mini");
    expect(callGateway).toContain('response_format: { type: "json_object" }');
    expect(callGateway).not.toContain("ai.gateway.lovable.dev");
    expect(callGateway).not.toContain("google/gemini-2.5-flash");
  });
});

/**
 * Every AI failure answers HTTP 200 with `ok: false`, so a branch that returns
 * without logging leaves no trace at all: not in the status codes, not in the
 * runtime errors, and not on screen. That is how voice transcription failed
 * silently in production for a day. Each handler must log before it returns.
 */
describe("AI failure branches are never silent", () => {
  const failureReturn = /return \{ ok: false as const/g;

  function assertEveryFailureIsLogged(handler: string, label: string) {
    const returns = [...handler.matchAll(failureReturn)];
    expect(returns.length, `${label} should have failure branches to check`).toBeGreaterThan(0);
    for (const match of returns) {
      const preceding = handler.slice(0, match.index);
      const sinceLastLog = preceding.slice(preceding.lastIndexOf("console.error"));
      expect(
        preceding.includes("console.error") && !sinceLastLog.includes("if (!res.ok)"),
        `${label}: a failure return at offset ${match.index} is not preceded by a console.error`,
      ).toBe(true);
    }
  }

  it("transcribeVoiceNote logs before returning any failure, including 429 and 402", () => {
    const src = source("./transcribe.functions.ts");
    const handler = src.slice(src.indexOf("export const transcribeVoiceNote"));

    assertEveryFailureIsLogged(handler, "transcribeVoiceNote");

    // The 429/402 shortcuts used to return above the log line.
    const openAiBranch = handler.slice(handler.indexOf("if (!res.ok)"));
    expect(openAiBranch.indexOf("console.error")).toBeLessThan(
      openAiBranch.indexOf("res.status === 429"),
    );
    expect(openAiBranch.indexOf("console.error")).toBeLessThan(
      openAiBranch.indexOf("res.status === 402"),
    );

    // An unset key must name itself rather than say "not configured".
    expect(handler).toContain("OPENAI_API_KEY is not set in this environment");
  });

  it("callGateway logs before returning any failure, including 429 and 402", () => {
    const src = source("./summarize.functions.ts");
    const gateway = src.slice(
      src.indexOf("async function callGateway"),
      src.indexOf("export const summarizeTranscript"),
    );

    const openAiBranch = gateway.slice(gateway.indexOf("if (!response.ok)"));
    expect(openAiBranch.indexOf("console.error")).toBeLessThan(
      openAiBranch.indexOf("response.status === 429"),
    );
    expect(openAiBranch.indexOf("console.error")).toBeLessThan(
      openAiBranch.indexOf("response.status === 402"),
    );
    expect(gateway).toContain("OPENAI_API_KEY is not set in this environment");
  });

  it("never logs the audio payload itself, only its length", () => {
    const src = source("./transcribe.functions.ts");
    expect(src).toContain("payload.audioBase64.length");
    expect(src).not.toMatch(/console\.(error|log|warn)\([^)]*payload\.audioBase64[^.]/);
  });
});
