import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Calendar, FileText, Plus } from "lucide-react";
import { mentorPrimaryActionLabels } from "./mentor-dashboard-cards";

interface MentorPrimaryActionsProps {
  canSubmitReport: boolean;
  canLogInteraction: boolean;
  canViewCalendar: boolean;
  onLogReport: () => void;
  onLogInteraction: () => void;
}

export function MentorPrimaryActions({
  canSubmitReport,
  canLogInteraction,
  canViewCalendar,
  onLogReport,
  onLogInteraction,
}: MentorPrimaryActionsProps) {
  if (!canSubmitReport && !canLogInteraction && !canViewCalendar) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {canSubmitReport && (
          <button
            type="button"
            onClick={onLogReport}
            className="flex min-h-14 items-center gap-2.5 rounded-lg bg-primary px-4 py-3 text-left text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <FileText className="size-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              {mentorPrimaryActionLabels.logMatchReport}
            </span>
          </button>
        )}
        {canLogInteraction && (
          <button
            type="button"
            onClick={onLogInteraction}
            className="flex min-h-14 items-center gap-2.5 rounded-lg border-2 border-primary bg-primary/10 px-4 py-3 text-left text-foreground hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="size-5 shrink-0 text-primary-ink" aria-hidden="true" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              {mentorPrimaryActionLabels.logInteraction}
            </span>
          </button>
        )}
      </div>
      {canViewCalendar && (
        <Link
          to="/calendar"
          search={{ gkId: "", new: false }}
          className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="inline-flex items-center gap-2.5">
            <Calendar className="size-5 text-primary-ink" aria-hidden="true" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              {mentorPrimaryActionLabels.viewCalendar}
            </span>
          </span>
          <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
