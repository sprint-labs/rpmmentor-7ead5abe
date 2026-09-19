/**
 * Colour band for a 0–5 skill score.
 *
 * The seven skill scores were all one green, so a 3.4 and a 4.4 looked alike
 * and the panel carried no signal until you read every number. The bands make
 * the shape of a goalkeeper's profile legible at a glance.
 *
 * Bands, as the owner set them:
 *
 *   4.0 and above   neon GK green    — `--rating-elite`
 *   3.0 to 3.9      yellow-green     — `--rating-strong`
 *   2.0 to 2.9      amber            — `--rating-average`
 *   below 2.0       red              — `--rating-poor`
 *
 * These are the GKHQ design system's own rating ramp. It has been defined in
 * `styles.css` for every theme since the system landed and was never used by
 * anything but the design gallery — inventing a second ramp beside it would
 * have left the product with two answers for the same question.
 *
 * Two of its twelve values did not clear 4.5:1 as text, which is consistent
 * with a ramp only ever used for fills: light `--rating-strong` sat at 4.14:1
 * and dark `--rating-poor` at 4.33:1 — the latter being the exact value
 * `--destructive` was moved off when that same failure was found on it. Both
 * were nudged when this shipped, and the contrast test now holds all four to
 * AA on both panel surfaces in all three themes.
 */

export type ScoreBand = "high" | "good" | "fair" | "low" | "unknown";

export interface ScoreTone {
  band: ScoreBand;
  /** Tailwind class for the progress bar fill. */
  bar: string;
  /** Tailwind class for the numeral. */
  ink: string;
}

const TONES: Record<ScoreBand, ScoreTone> = {
  high: { band: "high", bar: "bg-rating-elite", ink: "text-rating-elite" },
  good: { band: "good", bar: "bg-rating-strong", ink: "text-rating-strong" },
  fair: { band: "fair", bar: "bg-rating-average", ink: "text-rating-average" },
  low: { band: "low", bar: "bg-rating-poor", ink: "text-rating-poor" },
  // No score yet is not a bad score. It stays neutral rather than being
  // painted red, which would read as a goalkeeper who scored badly.
  unknown: { band: "unknown", bar: "bg-muted-foreground", ink: "text-foreground" },
};

/**
 * Band a score. Anything that is not a finite number — no reports yet, a failed
 * read — comes back `unknown`.
 */
export function scoreTone(value: number | null | undefined): ScoreTone {
  if (value == null || !Number.isFinite(value)) return TONES.unknown;
  if (value >= 4) return TONES.high;
  if (value >= 3) return TONES.good;
  if (value >= 2) return TONES.fair;
  return TONES.low;
}
