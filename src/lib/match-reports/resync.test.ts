import { describe, it, expect } from "vitest";
import { planResync, summarise, type ResyncLedgerRow } from "./resync";
import { computeReportUid } from "./schema";

function row(p: Partial<ResyncLedgerRow> & { id: string; status: string }): ResyncLedgerRow {
  return {
    submission_key: `k-${p.id}`,
    goalkeeper: "Alfie Beadle",
    team: "Rangers",
    opponent: "Blackburn",
    match_date: "2026-05-01",
    report_id: null,
    team_placeholder: undefined,
    ...p,
  } as ResyncLedgerRow;
}

const uid = computeReportUid({
  goalkeeper: "Alfie Beadle",
  team: "Rangers",
  opponent: "Blackburn",
  match_date: "2026-05-01",
});

describe("planResync", () => {
  it("only considers failed reservations", () => {
    const decisions = planResync(
      [
        row({ id: "a", status: "pending" }),
        row({ id: "b", status: "ambiguous" }),
        row({ id: "c", status: "succeeded" }),
      ],
      [],
    );
    expect(decisions).toHaveLength(0);
  });

  it("marks a failed reservation with no sheet row as retry-ready", () => {
    const d = planResync([row({ id: "a", status: "failed" })], []);
    expect(d).toHaveLength(1);
    expect(d[0].outcome).toBe("retry_ready");
  });

  it("holds a failed reservation when an unaccounted sheet row exists", () => {
    const d = planResync([row({ id: "a", status: "failed" })], [uid]);
    expect(d[0].outcome).toBe("hold_for_review");
  });

  it("still retries when the sheet row is explained by a succeeded reservation", () => {
    const d = planResync(
      [
        row({ id: "ok", status: "succeeded", report_id: uid }),
        row({ id: "a", status: "failed" }),
      ],
      [uid],
    );
    expect(d).toHaveLength(1);
    expect(d[0].outcome).toBe("retry_ready");
  });

  it("does not let one unexplained sheet row hold two failed reservations", () => {
    const d = planResync(
      [row({ id: "a", status: "failed" }), row({ id: "b", status: "failed" })],
      [uid],
    );
    expect(summarise(d)).toEqual({ checked: 2, retryReady: 1, heldForReview: 1 });
  });

  it("matches duplicate identities by base uid (~2 suffix)", () => {
    const d = planResync([row({ id: "a", status: "failed" })], [`${uid}~2`]);
    expect(d[0].outcome).toBe("hold_for_review");
  });
});
