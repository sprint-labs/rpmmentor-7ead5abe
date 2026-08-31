import { describe, expect, it } from "vitest";
import {
  ADMIN_RECENT_ANNOUNCEMENT_LIMIT,
  mergeAdminAnnouncementPages,
} from "./admin-announcements";

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
