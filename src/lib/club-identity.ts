/**
 * A stable visual identity for a club, derived from its name alone.
 *
 * The product has no crest artwork and no column to hold a crest URL, so a
 * report can only be told apart from the one above it by reading the text.
 * This gives every club a monogram and a colour that are the same on every
 * screen and in every session, without waiting on an asset pipeline.
 *
 * The colour comes from the existing `--chart-1..5` ramp, which is what this
 * app already uses for "these are different things" rather than "this one is
 * good and that one is bad". No new hue is introduced, and nothing here is
 * allowed to read as a status: the accent rides a rail and a ring, never the
 * text, so a club colour can never be mistaken for a duty-of-care colour.
 */

/** How many steps the categorical ramp has. Matches `--chart-1..5`. */
export const CLUB_ACCENT_COUNT = 5;

/** Words that carry no identity and are skipped when building a monogram. */
const NOISE = new Set([
  "fc",
  "afc",
  "cf",
  "the",
  "and",
  "of",
  "club",
  "football",
  "united", // only dropped when something else remains; see below.
  "city",
  "town",
  "county",
  "rovers",
  "wanderers",
  "albion",
  "athletic",
  "hotspur",
]);

/** Split a club name into its meaningful words. */
function words(club: string): string[] {
  return (
    club
      .normalize("NFKD")
      // Collapse a dotted abbreviation before splitting, so "F.C." becomes the
      // noise word "FC" rather than the two stray letters "F" and "C" — which
      // survived the noise filter and turned Tottenham Hotspur into "TFC".
      .replace(/\./g, "")
      .replace(/[^\p{L}\p{N}\s&-]/gu, " ")
      .split(/[\s&-]+/)
      .map((w) => w.trim())
      .filter(Boolean)
  );
}

/**
 * The letters shown on a club's badge, at most three.
 *
 * Distinctive words win: "Sheffield Wednesday" is SW, but "Manchester United"
 * and "Manchester City" would both be M on that rule alone, so a name whose
 * distinctive words reduce to a single letter keeps the common suffix — MU and
 * MC. A one-word name takes its first three letters, which is how a fan would
 * abbreviate it anyway: Wolves is WOL, Arsenal is ARS.
 */
export function clubInitials(club: string): string {
  const all = words(club);
  if (all.length === 0) return "—";

  const distinctive = all.filter((w) => !NOISE.has(w.toLowerCase()));
  // Every word was noise ("City"), so there is nothing distinctive to prefer.
  const chosen = distinctive.length > 0 ? distinctive : all;

  if (chosen.length === 1) {
    // One distinctive word. If the full name had more, a single letter would
    // collide with every other club sharing that word, so add the next one.
    const extra = all.find((w) => w !== chosen[0]);
    if (extra) return (chosen[0]![0]! + extra[0]!).toUpperCase();
    return chosen[0]!.slice(0, 3).toUpperCase();
  }

  return chosen
    .slice(0, 3)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase();
}

/**
 * Which step of the categorical ramp this club sits on, 1-based.
 *
 * A plain sum of code points is enough: the input is a short human name, the
 * output space is five, and the only property that matters is that one club
 * always lands on the same step. It is deliberately not random — a colour that
 * moved between renders would be worse than no colour at all.
 */
export function clubAccent(club: string): number {
  const key = club.trim().toLowerCase();
  if (!key) return 1;
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i) * (i + 1)) % 100_003;
  return (sum % CLUB_ACCENT_COUNT) + 1;
}
