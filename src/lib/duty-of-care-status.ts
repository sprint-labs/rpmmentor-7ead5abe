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
