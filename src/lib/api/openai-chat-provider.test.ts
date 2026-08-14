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
