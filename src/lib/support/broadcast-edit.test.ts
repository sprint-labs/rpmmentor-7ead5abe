import { describe, expect, it } from "vitest";
import { isBroadcastEditable, resolveBroadcastEditEnd } from "./broadcast-edit";

const PUBLISHED_AT = "2026-09-20T14:55:33.937Z";
const NOW = Date.parse("2026-09-20T16:00:00.000Z");

describe("isBroadcastEditable", () => {
  it("allows a live broadcast with no end", () => {
    expect(isBroadcastEditable({ startsAt: PUBLISHED_AT, endsAt: null, active: true }, NOW)).toBe(
      true,
    );
  });

  it("allows a live broadcast whose end is still ahead", () => {
    expect(
      isBroadcastEditable(
        { startsAt: PUBLISHED_AT, endsAt: "2026-09-27T14:55:33.937Z", active: true },
        NOW,
      ),
    ).toBe(true);
  });

  it("refuses one that was ended by hand", () => {
    expect(isBroadcastEditable({ startsAt: PUBLISHED_AT, endsAt: null, active: false }, NOW)).toBe(
      false,
    );
  });

  it("refuses one whose end has passed even while still marked active", () => {
    expect(
      isBroadcastEditable(
        { startsAt: PUBLISHED_AT, endsAt: "2026-09-20T15:00:00.000Z", active: true },
        NOW,
      ),
    ).toBe(false);
  });

  it("treats an end exactly at now as expired", () => {
    expect(
      isBroadcastEditable(
        { startsAt: PUBLISHED_AT, endsAt: new Date(NOW).toISOString(), active: true },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("resolveBroadcastEditEnd", () => {
  const target = { startsAt: PUBLISHED_AT };

  it("returns null when the broadcast should keep running", () => {
    expect(resolveBroadcastEditEnd({ expiryMode: "none", endsAt: "" }, target)).toBeNull();
  });

  it("ignores a leftover end time when the mode is none", () => {
    expect(
      resolveBroadcastEditEnd({ expiryMode: "none", endsAt: "2026-09-27T14:55" }, target),
    ).toBeNull();
  });

  it("converts a local input to an absolute instant", () => {
    const resolved = resolveBroadcastEditEnd(
      { expiryMode: "custom", endsAt: "2026-09-27T14:55" },
      target,
    );
    expect(resolved).not.toBeNull();
    expect(Date.parse(resolved as string)).toBe(new Date("2026-09-27T14:55").getTime());
  });

  it("rejects a blank end time when one was asked for", () => {
    expect(() => resolveBroadcastEditEnd({ expiryMode: "custom", endsAt: "   " }, target)).toThrow(
      /valid end time/,
    );
  });

  it("rejects an unparseable end time", () => {
    expect(() =>
      resolveBroadcastEditEnd({ expiryMode: "custom", endsAt: "not a date" }, target),
    ).toThrow(/valid end time/);
  });

  it("rejects an end time before the broadcast published", () => {
    expect(() =>
      resolveBroadcastEditEnd({ expiryMode: "custom", endsAt: "2026-09-19T09:00:00.000Z" }, target),
    ).toThrow(/after the publish time/);
  });

  it("rejects an end time equal to the publish time", () => {
    expect(() =>
      resolveBroadcastEditEnd({ expiryMode: "custom", endsAt: PUBLISHED_AT }, target),
    ).toThrow(/after the publish time/);
  });
});
