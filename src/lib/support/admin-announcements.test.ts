import { describe, expect, it } from "vitest";
import {
  ADMIN_RECENT_ANNOUNCEMENT_LIMIT,
  endedAtForAnnouncement,
  estimateAdminServerNow,
  mergeAdminAnnouncementPages,
} from "./admin-announcements";

describe("estimateAdminServerNow", () => {
  it("ignores a workstation clock that is hours ahead of the server", () => {
    const workstationReceivedAt = Date.parse("2026-09-01T14:00:00.000Z");
    expect(
      estimateAdminServerNow(
        "2026-09-01T10:00:00.000Z",
        workstationReceivedAt,
        workstationReceivedAt + 30_000,
      ),
    ).toBe(Date.parse("2026-09-01T10:00:30.000Z"));
  });

  it("falls back to client time for an older cached list response", () => {
    expect(estimateAdminServerNow(undefined, 0, 123_456)).toBe(123_456);
  });
});

describe("mergeAdminAnnouncementPages", () => {
  it("keeps an older live broadcast that would miss a newest-50 history page", () => {
    const stickyIncident = { id: "sticky-incident" };
    const recentEnded = Array.from({ length: ADMIN_RECENT_ANNOUNCEMENT_LIMIT }, (_, index) => ({
      id: `ended-${index}`,
    }));

    const merged = mergeAdminAnnouncementPages([stickyIncident], recentEnded);

    expect(merged[0]).toEqual(stickyIncident);
    expect(merged).toHaveLength(ADMIN_RECENT_ANNOUNCEMENT_LIMIT + 1);
    expect(merged.map((row) => row.id)).toContain("sticky-incident");
  });

  it("does not duplicate a row that appears on both pages", () => {
    const shared = { id: "shared" };
    expect(mergeAdminAnnouncementPages([shared], [shared, { id: "ended" }])).toEqual([
      shared,
      { id: "ended" },
    ]);
  });
});

describe("endedAtForAnnouncement", () => {
  it("timestamps a live Broadcast when it is ended", () => {
    expect(endedAtForAnnouncement("2026-09-01T09:00:00.000Z", "2026-09-01T10:00:00.000Z")).toBe(
      "2026-09-01T10:00:00.000Z",
    );
  });

  it("leaves ends_at empty when a scheduled Broadcast is cancelled", () => {
    expect(
      endedAtForAnnouncement("2026-09-02T09:00:00.000Z", "2026-09-01T10:00:00.000Z"),
    ).toBeNull();
  });

  it("leaves ends_at empty at the exact scheduled start boundary", () => {
    expect(
      endedAtForAnnouncement("2026-09-01T10:00:00.000Z", "2026-09-01T10:00:00.000Z"),
    ).toBeNull();
  });
});
