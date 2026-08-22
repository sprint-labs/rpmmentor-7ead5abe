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

  it("keeps durable notification caches scoped to the signed-in account", () => {
    expect(notificationsQueryKey("user-a")).not.toEqual(notificationsQueryKey("user-b"));
  });
});
