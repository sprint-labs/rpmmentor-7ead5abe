/**
 * The bell contains independently authorised sections. Its badge must only
 * count notifications that the current interface will actually render.
 */
export function visibleNotificationUnreadCount(
  eventInboxUnread: number,
  dutyUnread: number,
  canViewDutyNotifications: boolean,
  announcementUnread = 0,
): number {
  return eventInboxUnread + announcementUnread + (canViewDutyNotifications ? dutyUnread : 0);
}
