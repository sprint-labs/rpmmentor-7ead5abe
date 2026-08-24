import { describe, expect, it } from "vitest";
import { notificationsQueryKey } from "./events/query-keys";
import { visibleNotificationUnreadCount } from "./notification-visibility";

describe("visibleNotificationUnreadCount", () => {
  it("excludes hidden duty notifications from non-Super-Admin badges", () => {
    expect(visibleNotificationUnreadCount(0, 9, false)).toBe(0);
    expect(visibleNotificationUnreadCount(2, 9, false)).toBe(2);
  });

  it("includes both rendered bell sections for Super Admin", () => {
    expect(visibleNotificationUnreadCount(2, 9, true)).toBe(11);
  });

  it("adds unread announcements to the badge", () => {
    expect(visibleNotificationUnreadCount(2, 9, false, 3)).toBe(5);
    expect(visibleNotificationUnreadCount(2, 9, true, 3)).toBe(14);
  });

  it("defaults announcement unread to 0 for back-compat callers", () => {
    expect(visibleNotificationUnreadCount(2, 9, false)).toBe(2);
  });

  it("keeps durable notification caches scoped to the signed-in account", () => {
    expect(notificationsQueryKey("user-a")).not.toEqual(notificationsQueryKey("user-b"));
  });
});
