/**
 * Pure status transition mirrored by the support_messages AFTER INSERT trigger.
 *
 * Author writes → waiting_on_admin (including a reply that reopens resolved).
 * Admin writes → waiting_on_user, unless the thread is already resolved (stays resolved).
 */
import type { SupportThreadStatus } from "./schema";

export function nextSupportThreadStatus(input: {
  currentStatus: SupportThreadStatus;
  messageAuthorIsThreadAuthor: boolean;
}): SupportThreadStatus {
  if (input.messageAuthorIsThreadAuthor) {
    return "waiting_on_admin";
  }
  if (input.currentStatus === "resolved") {
    return "resolved";
  }
  return "waiting_on_user";
}
