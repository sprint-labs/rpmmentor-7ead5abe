/**
 * The bell contains two independently authorised sections. Its badge must only
 * count notifications that the current interface will actually render.
 */
export function visibleNotificationUnreadCount(
  eventInboxUnread: number,
  dutyUnread: number,
  canViewDutyNotifications: boolean,
): number {
  return eventInboxUnread + (canViewDutyNotifications ? dutyUnread : 0);
}
