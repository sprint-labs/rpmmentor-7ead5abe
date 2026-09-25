/**
 * Words, colours and dates shared by every match-report surface. The
 * components that draw with them live in `components/reports/report-visuals`.
 */
import type { ScoreBand } from "@/lib/score-band";
import type { PillarId } from "@/lib/match-reports/schema";

/**
 * Pillar names short enough to sit above a five-pip bar.
 *
 * `PILLAR_LABELS` is the formal wording ("Courage / Control / Intelligent /
 * Competitor") and stays the label on the report itself. At card width it
 * would wrap to four lines, so these are the same seven in one word each.
 */
export const SHORT_PILLAR: Record<PillarId, string> = {
  protect_goal: "Goal",
  protect_space: "Space",
  protect_air: "Air",
  control_play: "Control",
  change_play: "Change",
  psych: "Mental",
  physical: "Physical",
};

/** The design system's names for the rating ramp (see `/design/gkhq`). */
export const BAND_LABEL: Record<ScoreBand, string> = {
  high: "Elite",
  good: "Strong",
  fair: "Average",
  low: "Poor",
  unknown: "Unscored",
};

/**
 * The band's colour as a CSS value, for the one place a class cannot reach: a
 * gradient. Tokens only, so every theme (print included) re-colours it.
 */
export const BAND_COLOR: Record<ScoreBand, string> = {
  high: "var(--rating-elite)",
  good: "var(--rating-strong)",
  fair: "var(--rating-average)",
  low: "var(--rating-poor)",
  unknown: "var(--muted-foreground)",
};

/**
 * A match date a person would say out loud: "Sun, 20 Sept 2026".
 *
 * Parsed into local parts rather than through `new Date(iso)`, which reads a
 * date-only value as UTC midnight and moves it to the previous day for anyone
 * west of UTC.
 */
export function formatMatchDate(iso: string | null): string {
  if (!iso) return "Date not recorded";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Team v Opponent", or whichever side was recorded. */
export function fixtureOf(team: string | null, opponent: string | null): string {
  return [team?.trim(), opponent?.trim()].filter(Boolean).join(" v ");
}
