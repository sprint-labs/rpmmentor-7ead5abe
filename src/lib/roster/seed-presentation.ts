/**
 * The last six goalkeeper fields with nowhere to live in the database.
 *
 * `public.players` has no column for date of birth, age, height, shirt number,
 * preferred foot or portrait. Everything else the roster shows — name, club,
 * league, nationality, parent club, loan status, contract, tier, Academy and
 * Free Agent — is a real column and is read live.
 *
 * So these six are quarantined here rather than left scattered through the
 * roster: one module, one export, and a single obvious thing to delete once the
 * columns exist. Nothing else should read the seed for display.
 *
 * A goalkeeper with no entry — anyone added to the roster since the seed was
 * captured — simply has none of these, and every consumer already renders a
 * "not recorded" state for each. That is honest: we do not know their height.
 */
import { goalkeepers, type Goalkeeper } from "@/lib/mock-data";
import { normalisePersonName } from "@/lib/goalkeeper-player-link";

/** The fields that are still seed-only. Presentation, never logic. */
export type SeedPresentation = Pick<
  Goalkeeper,
  "dob" | "age" | "height" | "shirtNumber" | "foot" | "profileImage"
>;

function buildIndex(source: readonly Goalkeeper[]): Map<string, SeedPresentation> {
  const index = new Map<string, SeedPresentation>();
  for (const gk of source) {
    const key = normalisePersonName(gk.name);
    if (!key) continue;
    index.set(key, {
      dob: gk.dob,
      age: gk.age,
      height: gk.height,
      shirtNumber: gk.shirtNumber,
      foot: gk.foot,
      profileImage: gk.profileImage,
    });
  }
  return index;
}

/**
 * Built once from the seed roster already in memory, so this adds no second
 * copy of the data — only a narrower view of it.
 */
const SEED_PRESENTATION = buildIndex(goalkeepers);

/** Empty rather than undefined, so callers never branch on "do we know them". */
const NOTHING_RECORDED: SeedPresentation = {
  dob: "",
  // Not zero. A zero here reaches the roster as the literal age "0", which is
  // a claim about a real person rather than an admission we have no date.
  age: null,
  height: null,
  shirtNumber: null,
  foot: null,
  profileImage: undefined,
};

/** Presentation-only fields for a goalkeeper, by name. */
export function seedPresentationFor(fullName: string): SeedPresentation {
  return SEED_PRESENTATION.get(normalisePersonName(fullName)) ?? NOTHING_RECORDED;
}

/** How many live goalkeepers still have no recorded presentation data. */
export function countWithoutPresentation(fullNames: readonly string[]): number {
  return fullNames.filter((name) => !SEED_PRESENTATION.has(normalisePersonName(name))).length;
}
