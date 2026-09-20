import { describe, expect, it } from "vitest";
import { searchForDistributionRow } from "./roster-distribution-links";
import { buildRosterSnapshot, UNASSIGNED_TIER_LABEL } from "./roster-snapshot";
import { filterGoalkeepers, type GoalkeeperFilterState } from "./goalkeeper-filters";
import { toGoalkeepers } from "./roster/live-goalkeepers";
import type { PlayerRosterRow } from "./players.functions";

function player(over: Partial<PlayerRosterRow> = {}): PlayerRosterRow {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    full_name: "A Goalkeeper",
    current_club: "Some Club",
    parent_club: null,
    on_loan: false,
    league: "EFL Championship",
    nationality: "England",
    instagram_url: null,
    contract_until: "June 2027",
    tier: "Tier 1",
    is_academy: false,
    is_free_agent: false,
    ...over,
  };
}

const NO_FILTERS: GoalkeeperFilterState = {
  q: "",
  cat: "All",
  duty: "all",
  tiers: "",
  leagues: "",
  nats: "",
  club: "",
  contract: "any",
  ratingMin: 1,
  ratingMax: 5,
  loan: "any",
};

describe("each row targets the roster page's own filters", () => {
  it("sends a tier row to the tier multi-select", () => {
    expect(searchForDistributionRow("Tier 1")).toEqual({ tiers: "Tier 1" });
    expect(searchForDistributionRow("Tier 4")).toEqual({ tiers: "Tier 4" });
  });

  it("sends Unassigned to the tier multi-select too", () => {
    expect(searchForDistributionRow(UNASSIGNED_TIER_LABEL)).toEqual({ tiers: "Unassigned" });
  });

  it("sends the statuses to the category filter, not the tier one", () => {
    // Academy and Free Agent are not tiers, so selecting one must not look
    // like a tier selection.
    expect(searchForDistributionRow("Academy")).toEqual({ cat: "Academy" });
    expect(searchForDistributionRow("Free Agent")).toEqual({ cat: "Free Agents" });
  });

  it("uses the plural spelling the roster page actually recognises", () => {
    // "Free Agent" is the row's label; "Free Agents" is the filter's value.
    // Getting this wrong silently returns the whole roster.
    expect(searchForDistributionRow("Free Agent").cat).toBe("Free Agents");
  });
});

describe("the count on a row equals the results at the other end", () => {
  // This is the whole point of the change: the distribution and the roster read
  // the same table, so a drill-down cannot land on a different number.
  const rows: PlayerRosterRow[] = [
    player({ full_name: "Tier One A", tier: "Tier 1" }),
    player({ full_name: "Tier One B", tier: "Tier 1" }),
    player({ full_name: "Tier One Academy", tier: "Tier 1", is_academy: true }),
    player({ full_name: "Tier Two", tier: "Tier 2" }),
    player({ full_name: "Tier Three Academy", tier: "Tier 3", is_academy: true }),
    player({ full_name: "Tier Four Free", tier: "Tier 4", is_free_agent: true }),
    player({ full_name: "Untiered One", tier: null }),
    player({ full_name: "Untiered Two", tier: null }),
  ];

  const snapshot = buildRosterSnapshot(rows);
  const roster = toGoalkeepers(rows);
  const noRatings = new Map();

  function countAtDestination(label: Parameters<typeof searchForDistributionRow>[0]): number {
    const search = { ...NO_FILTERS, ...searchForDistributionRow(label) };
    return filterGoalkeepers(roster, search, noRatings).length;
  }

  it.each(["Tier 1", "Tier 2", "Tier 3", "Tier 4", UNASSIGNED_TIER_LABEL] as const)(
    "%s reconciles",
    (label) => {
      const row = snapshot.tiers.find((r) => r.label === label);
      expect(row).toBeDefined();
      expect(countAtDestination(label)).toBe(row!.count);
    },
  );

  it.each(["Academy", "Free Agent"] as const)("%s reconciles", (label) => {
    const row = snapshot.statuses.find((r) => r.label === label);
    expect(row).toBeDefined();
    expect(countAtDestination(label)).toBe(row!.count);
  });

  it("counts an academy goalkeeper under their tier AND under Academy", () => {
    // Three Tier 1s, two of whom are in an academy — the pairing the old
    // single tier column could not hold.
    expect(countAtDestination("Tier 1")).toBe(3);
    expect(countAtDestination("Academy")).toBe(2);
  });

  it("reconciles the tier rows to the whole roster", () => {
    const bucketed = snapshot.tiers.reduce((total, row) => total + row.count, 0);

    expect(bucketed).toBe(snapshot.total);
    expect(bucketed).toBe(rows.length);
  });
});
