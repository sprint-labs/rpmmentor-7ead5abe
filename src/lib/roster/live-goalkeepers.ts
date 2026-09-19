/**
 * The live roster, shaped for the screens that already render goalkeepers.
 *
 * `public.players` is the source of truth. This maps a row onto the existing
 * `Goalkeeper` view model so the roster list, its filters and its sorts keep
 * working, rather than a parallel type being threaded through every consumer.
 *
 * Three things are worth knowing about the mapping:
 *
 *   - **Ids are the legacy slug**, built by `legacyGkSlugForName`, so
 *     `/goalkeepers/gk-harrison-male` keeps resolving and no bookmark breaks.
 *     They are deliberately NOT `players.id`.
 *
 *   - **`contract_until` is stored as "June 2027"**, not ISO — 113 of 116 rows
 *     at the time of writing. The contract sort, the expiry filter and the year
 *     dropdown all assume ISO, so `contractISO` converts exactly as the seed
 *     pipeline did. Skipping this breaks all three silently.
 *
 *   - **Academy and Free Agent come from their own columns**, so a goalkeeper
 *     can hold a tier and a status at once. `tags` carries them, which is the
 *     shape the category filter already expects.
 *
 * The RNG placeholders the seed invented — rating, potential, recommendation,
 * last and next interaction — are not carried across. Nothing on the roster
 * reads them: the rating column averages real match reports, and duty of care
 * comes from `public.player_duty_of_care`.
 */
import {
  contractISO,
  initialsOf,
  regionForLeague,
  type Goalkeeper,
  type GoalkeeperTag,
  type TierLevel,
  type TierLevelLabel,
} from "@/lib/mock-data";
import { legacyGkSlugForName } from "@/lib/goalkeeper-player-link";
import type { PlayerRosterRow } from "@/lib/players.functions";
import { seedPresentationFor } from "@/lib/roster/seed-presentation";

const TIER_LABELS: readonly string[] = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];

/** The stored tier, or null when management has not assigned one. */
function tierLabelOf(row: PlayerRosterRow): TierLevelLabel | null {
  const tier = row.tier?.trim();
  if (!tier || !TIER_LABELS.includes(tier)) return null;
  return tier as TierLevelLabel;
}

/** 1–4 from "Tier 1"–"Tier 4"; null when untiered. */
function tierLevelOf(label: TierLevelLabel | null): TierLevel | null {
  if (!label) return null;
  return Number(label.slice(-1)) as TierLevel;
}

function tagsOf(row: PlayerRosterRow): GoalkeeperTag[] {
  const tags: GoalkeeperTag[] = [];
  if (row.is_academy) tags.push("Academy");
  if (row.is_free_agent) tags.push("Free Agent");
  return tags;
}

/**
 * `contract_until` holds "June 2027" in the database and ISO is what the UI
 * sorts and filters on. An unparseable or absent value becomes the em-dash the
 * seed used for "none recorded", which the contract filter already handles.
 */
function contractOf(row: PlayerRosterRow): string {
  const stored = row.contract_until?.trim();
  if (!stored) return "—";
  return contractISO(stored);
}

/** Map one live roster row onto the goalkeeper view model. */
export function toGoalkeeper(row: PlayerRosterRow): Goalkeeper {
  const tier = tierLabelOf(row);
  const presentation = seedPresentationFor(row.full_name);

  return {
    id: legacyGkSlugForName(row.full_name),
    name: row.full_name,
    initials: initialsOf(row.full_name),
    // `status` is the legacy single-field view of tier. It is no longer where
    // Academy or Free Agent live; those are in `tags`.
    status: tier,
    tier,
    tierLevel: tierLevelOf(tier),
    tags: tagsOf(row),
    region: regionForLeague(row.league),
    // Mentors are not assigned per goalkeeper; the seed's round-robin was an
    // artefact of generating the fixture, so nothing is invented here.
    mentorId: "",
    club: row.current_club,
    league: row.league,
    nationality: row.nationality,
    contractUntil: contractOf(row),
    parentClub: row.parent_club ?? undefined,
    onLoan: row.on_loan,
    instagram: row.instagram_url ?? undefined,
    // Reserved slot: a highlight reel is attached through Media, not here.
    videoLinks: [],
    // The six fields with no column yet. See `seed-presentation.ts`.
    dob: presentation.dob,
    age: presentation.age,
    height: presentation.height,
    shirtNumber: presentation.shirtNumber,
    foot: presentation.foot,
    profileImage: presentation.profileImage,
    // Placeholders the seed generated at random. Nothing on the roster reads
    // them — the rating column averages real match reports — so they are zeroed
    // rather than invented.
    rating: 0,
    potential: 0,
    recommendation: "Monitor",
    lastInteraction: "",
    nextInteraction: "",
  };
}

/** Map the whole roster, in the order the database returned it. */
export function toGoalkeepers(rows: readonly PlayerRosterRow[] | null | undefined): Goalkeeper[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(toGoalkeeper);
}

/**
 * The roster row a `/goalkeepers/gk-…` URL names, or null when none matches.
 *
 * Keyed by the same legacy slug `toGoalkeeper` assigns, so the profile page
 * resolves exactly what the roster list linked to — including a goalkeeper
 * signed since the seed fixture was captured, who has no seed entry at all.
 * Null here means a genuine miss, not "the roster has not arrived yet"; the
 * caller decides that from its own query state.
 */
export function rosterRowForLegacySlug(
  rows: readonly PlayerRosterRow[] | null | undefined,
  slug: string,
): PlayerRosterRow | null {
  if (!Array.isArray(rows) || !slug) return null;
  return rows.find((row) => legacyGkSlugForName(row.full_name) === slug) ?? null;
}
