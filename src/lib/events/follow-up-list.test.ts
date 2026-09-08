import { describe, expect, it } from "vitest";
import type { EventFollowUpRow } from "./follow-up-query.server";
import { isFollowUpListItem } from "./follow-up-list";

function row(
  status: EventFollowUpRow["followUp"]["status"],
  participationStatus: EventFollowUpRow["participationStatus"],
  kind: EventFollowUpRow["followUp"]["kind"] = null,
) {
  return {
    eventType: "Match",
    participationStatus,
    followUp: { status, kind },
  } as EventFollowUpRow;
}

describe("isFollowUpListItem", () => {
  it("shows unconfirmed participation as management work, not mentor work", () => {
    const candidate = row("confirmation_needed", "not_confirmed");
    expect(isFollowUpListItem(candidate, true)).toBe(true);
    expect(isFollowUpListItem(candidate, false)).toBe(false);
  });

  it("retains did-not-play Matches for manager correction", () => {
    const candidate = row("not_required", "did_not_play");
    expect(isFollowUpListItem(candidate, true)).toBe(true);
    expect(isFollowUpListItem(candidate, false)).toBe(false);
  });

  it("keeps ordinary report and interaction work visible to both roles", () => {
    const candidate = row("overdue", "played", "match_report");
    expect(isFollowUpListItem(candidate, true)).toBe(true);
    expect(isFollowUpListItem(candidate, false)).toBe(true);
  });
});
