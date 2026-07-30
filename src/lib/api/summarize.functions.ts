import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FixtureContextSchema = z.object({
  goalkeeper: z.string().max(80).optional().default(""),
  team: z.string().max(80).optional().default(""),
  opponent: z.string().max(80).optional().default(""),
  competition: z.string().max(80).optional().default(""),
  matchDate: z.string().max(20).optional().default(""),
});

const RewriteInputSchema = z.object({
  transcript: z.string().min(20).max(20_000),
  context: FixtureContextSchema,
});

const SummaryInputSchema = z.object({
  transcript: z.string().min(20).max(20_000),
  context: z.string().max(500).optional(),
});

const AnalysisInputSchema = z.object({
  reportText: z.string().min(40).max(20_000),
  context: FixtureContextSchema,
});

export type FixtureContext = z.infer<typeof FixtureContextSchema>;

export type StructuredAnalysis = {
  summary: string;
  keyMoments: string[];
  developmentFocus: string[];
};

export type StructuredSummary = {
  headline: string;
  strengths: string[];
  improvements: string[];
  keyMoments: string[];
};

const SUMMARY_SYSTEM_PROMPT = `You summarise transcribed voice notes from a goalkeeper mentor into a short, structured coaching summary.

Return STRICT JSON with this exact shape:
{
  "headline": string,
  "strengths": string[],
  "improvements": string[],
  "keyMoments": string[]
}

Rules:
- Only include information the transcript supports. Do not invent details.
- Keep player, club, drill, opponent and score references verbatim.
- If a section has nothing, return an empty array.
- Return at most 5 items in each array.
- Do not wrap in markdown fences. Return only the JSON object.`;

const REWRITE_SYSTEM_PROMPT = `You produce a faithful, professional rewrite of a goalkeeper mentor's spoken match report.

Return STRICT JSON with this exact shape:
{
  "rewrite": string
}

Rules:
- This is a rewrite, not a summary. Retain every meaningful supported observation, incident, minute and coaching point.
- Remove filler words, false starts and casual or unprofessional asides while preserving the mentor's intended meaning and natural tone.
- Use the canonical fixture context for the goalkeeper, team, opponent, competition and date. Correct obvious speech-to-text near-matches to those exact canonical values.
- Never invent an event, score, minute, outcome, player or coaching observation.
- Do not add "Summary", "Key Moments", "Development Focus", bullet lists or any other section headings.
- Write clear free-form prose suitable for the report's single Comments field.
- Do not wrap the response in markdown fences. Return only the JSON object.`;

const ANALYSIS_SYSTEM_PROMPT = `You create a private structured coaching analysis from an existing goalkeeper match report for a Super Admin.

Return STRICT JSON with this exact shape:
{
  "summary": string,
  "keyMoments": string[],
  "developmentFocus": string[]
}

Rules:
- Only include information supported by the report.
- Use canonical fixture context for the goalkeeper, team, opponent, competition and date.
- Keep the summary concise while retaining the overall performance and confidence context.
- Put saves, distribution, goals conceded and decisive actions in keyMoments, including minutes where available.
- Put specific coaching actions in developmentFocus. Do not invent a focus when the report provides none.
- Return at most 6 items in each array.
- Do not wrap the response in markdown fences. Return only the JSON object.`;

function fixtureContextText(context: FixtureContext): string {
  return [
    `Goalkeeper: ${context.goalkeeper || "Not supplied"}`,
    `Team: ${context.team || "Not supplied"}`,
    `Opponent: ${context.opponent || "Not supplied"}`,
    `Competition: ${context.competition || "Not supplied"}`,
    `Match date: ${context.matchDate || "Not supplied"}`,
  ].join("\n");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const value = JSON.parse(match[0]);
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function coerceStringArray(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => (item.length > 300 ? `${item.slice(0, 297)}…` : item));
}

async function callGateway(systemPrompt: string, userText: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI service is not configured." };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return { ok: false as const, error: "Rate limit reached — please try again in a moment." };
    }
    if (response.status === 402) {
      return { ok: false as const, error: "AI credits exhausted — add credits in workspace settings." };
    }
    console.error("AI gateway error", response.status);
    return { ok: false as const, error: `AI request failed (${response.status}).` };
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) return { ok: false as const, error: "Could not parse the AI response." };
  return { ok: true as const, parsed };
}

export const summarizeTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SummaryInputSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await callGateway(
      SUMMARY_SYSTEM_PROMPT,
      `${data.context?.trim() ? `Context: ${data.context.trim()}\n\n` : ""}Transcript:\n${data.transcript.trim()}`,
    );
    if (!result.ok) return result;

    const headline =
      typeof result.parsed.headline === "string" ? result.parsed.headline.trim() : "";
    const summary: StructuredSummary = {
      headline: headline.length > 200 ? `${headline.slice(0, 197)}…` : headline,
      strengths: coerceStringArray(result.parsed.strengths, 5),
      improvements: coerceStringArray(result.parsed.improvements, 5),
      keyMoments: coerceStringArray(result.parsed.keyMoments, 5),
    };
    return { ok: true as const, summary };
  });

export const rewriteTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RewriteInputSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await callGateway(
      REWRITE_SYSTEM_PROMPT,
      `Canonical fixture context:\n${fixtureContextText(data.context)}\n\nTranscript:\n${data.transcript.trim()}`,
    );
    if (!result.ok) return result;

    const rawRewrite =
      typeof result.parsed.rewrite === "string" ? result.parsed.rewrite.trim() : "";
    if (!rawRewrite) return { ok: false as const, error: "No AI rewrite was returned." };

    return {
      ok: true as const,
      rewrite: rawRewrite.length > 5_000 ? `${rawRewrite.slice(0, 4_997)}…` : rawRewrite,
    };
  });

export const analyzeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AnalysisInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error("Unable to verify Super Admin access.");
    if (!(roleRows ?? []).some((row) => row.role === "super_admin")) {
      throw new Error("Only Super Admins can generate structured report analysis.");
    }

    const result = await callGateway(
      ANALYSIS_SYSTEM_PROMPT,
      `Canonical fixture context:\n${fixtureContextText(data.context)}\n\nMatch report:\n${data.reportText.trim()}`,
    );
    if (!result.ok) return result;

    const summary =
      typeof result.parsed.summary === "string" ? result.parsed.summary.trim() : "";
    const analysis: StructuredAnalysis = {
      summary: summary.length > 1_500 ? `${summary.slice(0, 1_497)}…` : summary,
      keyMoments: coerceStringArray(result.parsed.keyMoments),
      developmentFocus: coerceStringArray(result.parsed.developmentFocus),
    };

    if (!analysis.summary && analysis.keyMoments.length === 0 && analysis.developmentFocus.length === 0) {
      return { ok: false as const, error: "No structured analysis was returned." };
    }
    return { ok: true as const, analysis };
  });
