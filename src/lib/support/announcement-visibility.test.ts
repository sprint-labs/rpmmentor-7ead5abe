import { describe, expect, it } from "vitest";
import { isAnnouncementBannerVisible, isAnnouncementInBell } from "./announcement-visibility";

const now = Date.parse("2026-08-24T12:00:00Z");

describe("announcement visibility", () => {
  const liveFeature = {
    kind: "feature" as const,
    active: true,
    startsAt: "2026-08-01T00:00:00Z",
    endsAt: null,
    readAt: null,
    now,
  };

  it("shows an unread in-window announcement in the bell", () => {
    expect(isAnnouncementInBell(liveFeature)).toBe(true);
    expect(isAnnouncementBannerVisible(liveFeature)).toBe(false);
  });

  it("hides a dismissed announcement from the bell", () => {
    expect(isAnnouncementInBell({ ...liveFeature, readAt: "2026-08-24T11:00:00Z" })).toBe(false);
  });

  it("shows an incident as a banner even after it is dismissed", () => {
    const incident = {
      ...liveFeature,
      kind: "incident" as const,
      readAt: "2026-08-24T11:00:00Z",
    };
    expect(isAnnouncementInBell(incident)).toBe(false);
    expect(isAnnouncementBannerVisible(incident)).toBe(true);
  });

  it("shows neither bell nor banner after ends_at", () => {
    const expired = {
      ...liveFeature,
      kind: "incident" as const,
      endsAt: "2026-08-24T11:00:00Z",
    };
    expect(isAnnouncementInBell(expired)).toBe(false);
    expect(isAnnouncementBannerVisible(expired)).toBe(false);
  });

  it("hides inactive announcements from both surfaces", () => {
    const inactive = { ...liveFeature, kind: "downtime" as const, active: false };
    expect(isAnnouncementInBell(inactive)).toBe(false);
    expect(isAnnouncementBannerVisible(inactive)).toBe(false);
  });
});
