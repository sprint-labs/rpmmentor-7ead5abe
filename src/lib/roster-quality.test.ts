import { describe, expect, it } from "vitest";
import {
  auditRoster,
  checkGoalkeeper,
  isDatabaseBacked,
  NOT_CAPTURED_CODES,
  parseContractDate,
  parseDob,
  summarise,
  type IssueCode,
} from "./roster-quality";
import { toGoalkeeper } from "./roster/live-goalkeepers";
import type { Goalkeeper } from "./mock-data";
import type { PlayerRosterRow } from "./players.functions";

const NOW = new Date(2026, 8, 19); // 19 September 2026

function row(over: Partial<PlayerRosterRow> = {}): PlayerRosterRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    full_name: "Harrison Male",
    current_club: "York City",
    parent_club: "York City",
    on_loan: false,
    league: "National League",
    nationality: "England",
    instagram_url: null,
    contract_until: "June 2027",
    tier: "Tier 3",
    is_academy: false,
    is_free_agent: false,
    ...over,
  };
}

/** A goalkeeper who passes every database-backed check. */
function clean(over: Partial<Goalkeeper> = {}): Goalkeeper {
  return { ...toGoalkeeper(row()), ...over };
}

function codes(gk: Goalkeeper, options?: Parameters<typeof checkGoalkeeper>[2]): IssueCode[] {
  return checkGoalkeeper(gk, NOW, options).map((i) => i.code);
}

describe("parseDob", () => {
  // `Goalkeeper.dob` is ISO — `mock-data` converts the seed's dd/mm/yyyy on the
  // way out. This parser only read the pre-conversion form, so the DOB check
  // was failing for the whole roster before anything moved to the database.
  it("reads an ISO date", () => {
    const parsed = parseDob("1999-01-08");

    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(1999);
    expect(parsed!.getMonth()).toBe(0);
    expect(parsed!.getDate()).toBe(8);
  });

  it("still reads a hand-typed dd/mm/yyyy date", () => {
    const parsed = parseDob("08/01/1999");

    expect(parsed).not.toBeNull();
    expect(parsed!.getMonth()).toBe(0);
    expect(parsed!.getDate()).toBe(8);
  });

  it("rejects an empty value and a date that is not real", () => {
    expect(parseDob("")).toBeNull();
    expect(parseDob(null)).toBeNull();
    // 31 February would otherwise roll silently into March.
    expect(parseDob("1999-02-31")).toBeNull();
    expect(parseDob("not a date")).toBeNull();
  });

  it("clears the DOB check for a valid ISO date", () => {
    expect(codes(clean({ dob: "1999-01-08", age: 27 }))).not.toContain("missing_dob");
  });

  it("still catches an age that does not match the DOB", () => {
    expect(codes(clean({ dob: "1999-01-08", age: 40 }))).toContain("age_dob_mismatch");
  });
});

describe("parseContractDate", () => {
  // `contractUntil` reaches the audit as ISO, because `contractISO` converts
  // the stored "June 2027" on the way into the view model.
  it("reads both the ISO form and the stored month-and-year form", () => {
    expect(parseContractDate("2027-06-30")?.getFullYear()).toBe(2027);
    expect(parseContractDate("June 2027")?.getMonth()).toBe(5);
  });

  it("rejects a value it cannot read", () => {
    // `contractISO` turns an unreadable stored value into "undefined-06-30".
    expect(parseContractDate("undefined-06-30")).toBeNull();
    expect(parseContractDate("TBC")).toBeNull();
  });

  it("does not flag a live contract as unreadable", () => {
    expect(codes(clean())).not.toContain("unparseable_contract");
  });

  it('treats the roster’s "—" as a missing contract, not an unreadable one', () => {
    const issues = codes(clean({ contractUntil: "—" }));

    expect(issues).toContain("missing_contract");
    expect(issues).not.toContain("unparseable_contract");
  });

  it("still flags an expired contract", () => {
    expect(codes(clean({ contractUntil: "2025-06-30" }))).toContain("contract_expired");
  });
});

describe("the split between what the database can and cannot answer", () => {
  it("names the checks with no column behind them", () => {
    expect([...NOT_CAPTURED_CODES]).toEqual([
      "missing_dob",
      "age_dob_mismatch",
      "missing_profile_image",
    ]);
    expect(isDatabaseBacked("missing_club")).toBe(true);
    expect(isDatabaseBacked("missing_dob")).toBe(false);
  });

  it("drops them from the audit when only database-backed checks are wanted", () => {
    // A live-only goalkeeper has no seed presentation data at all, so without
    // the split every one of them would be flagged for a field nobody can fill.
    const liveOnly = toGoalkeeper(row({ full_name: "Alfie Smith" }));

    expect(codes(liveOnly)).toContain("missing_dob");
    expect(codes(liveOnly, { databaseBackedOnly: true })).not.toContain("missing_dob");
    expect(codes(liveOnly, { databaseBackedOnly: true })).not.toContain("missing_profile_image");
  });

  it("keeps the checks the database can answer", () => {
    const gk = toGoalkeeper(row({ full_name: "Alfie Smith", nationality: "", league: "" }));

    expect(codes(gk, { databaseBackedOnly: true })).toEqual(
      expect.arrayContaining(["missing_nationality", "missing_league"]),
    );
  });

  it("reports a clean live-only goalkeeper as having nothing to fix", () => {
    const gk = toGoalkeeper(row({ full_name: "Alfie Smith" }));

    expect(checkGoalkeeper(gk, NOW, { databaseBackedOnly: true })).toEqual([]);
  });
});

describe("auditing the live roster", () => {
  it("includes a goalkeeper who exists only in the database", () => {
    // Daniel Barden was signed after the seed snapshot, so the old audit —
    // which read the frozen seed array — could never have seen him.
    const rows = [row({ full_name: "Harrison Male" }), row({ full_name: "Daniel Barden" })];
    const reports = auditRoster(rows.map(toGoalkeeper), NOW, { databaseBackedOnly: true });

    expect(reports.map((r) => r.gk.name)).toContain("Daniel Barden");
    expect(summarise(reports).totalGoalkeepers).toBe(2);
  });

  it("links a live-only goalkeeper to a profile URL that resolves", () => {
    const [report] = auditRoster([toGoalkeeper(row({ full_name: "Daniel Barden" }))], NOW, {
      databaseBackedOnly: true,
    });

    expect(report.gk.id).toBe("gk-daniel-barden");
  });

  it("flags an on-loan goalkeeper with no parent club", () => {
    const gk = toGoalkeeper(row({ on_loan: true, parent_club: null }));

    expect(codes(gk, { databaseBackedOnly: true })).toContain("missing_parent_club");
  });

  it("flags a parent club that differs from the club with the loan flag off", () => {
    const gk = toGoalkeeper(row({ on_loan: false, parent_club: "Norwich City" }));

    expect(codes(gk, { databaseBackedOnly: true })).toContain("parent_club_without_loan_flag");
  });

  it("does not ask a free agent for a club, league or contract", () => {
    const gk = toGoalkeeper(
      row({ is_free_agent: true, current_club: "Free Agent", league: "", contract_until: null }),
    );
    const issues = codes(gk, { databaseBackedOnly: true });

    expect(issues).not.toContain("missing_club");
    expect(issues).not.toContain("missing_league");
    expect(issues).not.toContain("missing_contract");
    expect(issues).not.toContain("free_agent_with_club");
  });
});
