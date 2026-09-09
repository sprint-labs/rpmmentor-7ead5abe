import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./reports.functions.ts", import.meta.url), "utf8");

describe("linked Match Report event snapshot wiring", () => {
  it("passes the preflight player identity into the atomic canonical insert", () => {
    expect(source).toContain("calendarEventPlayerId: linkedMatchTarget?.playerId ?? null");
  });

  it("builds the new Live Match Observation from the stored snapshot", () => {
    const interactionBlock = source.slice(
      source.indexOf("// ---- The Live Match Observation interaction"),
      source.indexOf("return {", source.indexOf("// ---- The Live Match Observation interaction")),
    );
    expect(interactionBlock).toContain(
      "written.calendarEventPlayerId ?? linkedMatchTarget?.playerId ?? null",
    );
  });

  it("uses the stored snapshot when an idempotent retry self-heals its interaction", () => {
    expect(source).toContain("calendar_event_id,calendar_event_player_id,goalkeeper");
    expect(source).toContain(
      "replayedReport?.calendar_event_player_id ?? linkedMatchTarget?.playerId ?? null",
    );
  });

  it("treats an atomic trigger rejection as a proven no-write ledger failure", () => {
    const failureBlock = source.slice(
      source.indexOf("if (!written.ok)"),
      source.indexOf("const finalReportId"),
    );
    expect(failureBlock).toContain('await markLedger({ status: "failed" })');
  });
});
