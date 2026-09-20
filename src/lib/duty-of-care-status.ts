/**
 * Map the database's duty-of-care state onto the roster's RAG vocabulary.
 *
 * `duty_of_care_at()` is the single source of truth for the status itself. The
 * roster UI has its own five-level vocabulary (`DutyLevel`) that drives the
 * traffic light and badge tones, so the two are reconciled here — in one pure
 * function — rather than in each component that renders a badge.
 */
import type { DutyOfCareState } from "@/lib/duty-of-care.functions";
import type { DutyLevel } from "@/lib/mock-data";

export function dutyLevelFromState(state: DutyOfCareState | string | null | undefined): DutyLevel {
  switch (state) {
    case "red":
      return "overdue";
    case "amber":
      return "due_soon";
    case "green":
    case "complete":
      return "up_to_date";
    case "not_required":
    case "off_season":
      return "not_required";
    default:
      return "not_enough_data";
  }
}

/**
 * Worst first: the order a mentor means when they sort by Duty of Care.
 *
 * The status is a five-point severity scale, not a word. Sorting on the label
 * instead sorts it alphabetically — "Due soon", "Not enough data", "Not
 * required", "Overdue", "Up to date" — which buries Overdue in fourth place and
 * moves rows around again whenever the view's `status_label` text changes.
 */
export const DUTY_SEVERITY: Record<DutyLevel, number> = {
  overdue: 0,
  due_soon: 1,
  up_to_date: 2,
  not_enough_data: 3,
  not_required: 4,
};
