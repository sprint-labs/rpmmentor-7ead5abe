import { Link } from "@tanstack/react-router";
import { CalendarDays, FileText, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { LoggedInteraction } from "@/lib/interactions/schema";

interface InteractionActionsProps {
  interaction: LoggedInteraction;
  onEdit: (interaction: LoggedInteraction) => void;
  onDelete: (interaction: LoggedInteraction) => void;
}

const BUTTON =
  "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40";

/**
 * The actions on a read-only interaction record. Showing or hiding a button
 * is presentation only: updateInteraction, deleteInteraction and RLS all
 * re-check the caller's role before anything is written.
 */
export function InteractionActions({ interaction, onEdit, onDelete }: InteractionActionsProps) {
  const { can, user } = useAuth();
  const canEdit = interaction.mentorId === user?.id || can("interactions.manage");
  const canDelete = can("interactions.delete");

  if (!canEdit && !canDelete && !interaction.matchReportId && !interaction.calendarEventId) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Interaction actions">
      {canEdit && (
        <button type="button" onClick={() => onEdit(interaction)} className={BUTTON}>
          <Pencil className="size-3.5" aria-hidden="true" /> Edit interaction
        </button>
      )}
      {interaction.matchReportId ? (
        <Link
          to="/reports/$reportId"
          params={{ reportId: interaction.matchReportId }}
          className={BUTTON}
        >
          <FileText className="size-3.5" aria-hidden="true" /> Open report
        </Link>
      ) : interaction.calendarEventId ? (
        <Link to="/calendar" className={BUTTON}>
          <CalendarDays className="size-3.5" aria-hidden="true" /> Open calendar
        </Link>
      ) : null}
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(interaction)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive hover:bg-destructive/10 sm:ml-auto"
        >
          <Trash2 className="size-3.5" aria-hidden="true" /> Delete interaction
        </button>
      )}
    </div>
  );
}
