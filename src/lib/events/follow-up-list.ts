import type { EventFollowUpRow } from "./follow-up-query.server";

type FollowUpListCandidate = Pick<
  EventFollowUpRow,
  "eventType" | "participationStatus" | "followUp"
>;

/**
 * Keep mentor work lists actionable while retaining a management correction
 * path for completed participation decisions.
 */
export function isFollowUpListItem(row: FollowUpListCandidate, canManage: boolean): boolean {
  if (row.followUp.kind !== null) return true;
  if (!canManage) return false;
  if (row.followUp.status === "confirmation_needed") return true;
  return row.eventType === "Match" && row.participationStatus === "did_not_play";
}
