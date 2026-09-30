import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteInteraction } from "@/lib/interactions.functions";
import { refreshInteractionViews } from "@/lib/query-refresh";
import { formatDateOnly, type LoggedInteraction } from "@/lib/interactions/schema";
import {
  confirmationMatches,
  deleteConfirmationPhrase,
} from "@/lib/interactions/delete-confirmation";

interface DeleteInteractionDialogProps {
  interaction: LoggedInteraction | null;
  onClose: () => void;
  /** Runs after the server confirms the soft delete and caches are refreshed. */
  onDeleted?: (interaction: LoggedInteraction) => void;
}

/**
 * Two-step delete: first explain what happens, then require the goalkeeper and
 * interaction type to be typed out. The server re-checks the role, so this is
 * friction against accidents, not the permission boundary.
 */
export function DeleteInteractionDialog({
  interaction,
  onClose,
  onDeleted,
}: DeleteInteractionDialogProps) {
  const queryClient = useQueryClient();
  const deleteInteractionFn = useServerFn(deleteInteraction);
  const [step, setStep] = useState<"warn" | "confirm">("warn");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStep("warn");
    setTyped("");
    setBusy(false);
  }, [interaction?.id]);

  if (!interaction) return null;
  const phrase = deleteConfirmationPhrase(interaction);
  const matches = confirmationMatches(typed, interaction);

  const runDelete = async () => {
    if (!matches || busy) return;
    setBusy(true);
    try {
      const result = await deleteInteractionFn({ data: { id: interaction.id } });
      if (!result.deleted) {
        toast.error("This interaction is no longer available to delete.");
        onClose();
        return;
      }
      await refreshInteractionViews(queryClient);
      toast.success("Interaction deleted");
      if (result.reopenedCalendarFollowUp) {
        toast.info("Its calendar follow-up is outstanding again.");
      }
      onClose();
      onDeleted?.(interaction);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not delete the interaction.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        {step === "warn" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this interaction?</AlertDialogTitle>
              <AlertDialogDescription>
                {interaction.interactionType} with {interaction.goalkeeperName} on{" "}
                {formatDateOnly(interaction.occurredAt)}
                {interaction.mentorName ? `, logged by ${interaction.mentorName}` : ""}. It will
                disappear from every view. The original record and its edit history are kept for
                recovery.
                {interaction.matchReportId
                  ? " If its source Match Report is still active, deletion will be blocked and the report must be deleted first."
                  : ""}
                {interaction.calendarEventId
                  ? " Because it completes a scheduled event, that calendar follow-up will become outstanding again."
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-destructive/50 px-4 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                Continue
              </button>
            </AlertDialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runDelete();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Type to confirm</AlertDialogTitle>
              <AlertDialogDescription>
                To delete this interaction, type{" "}
                <strong className="font-semibold text-foreground">{phrase}</strong> below.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="mt-4 block">
              <span className="sr-only">Type {phrase} to confirm</span>
              <input
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={phrase}
                disabled={busy}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel type="button" disabled={busy}>
                Cancel
              </AlertDialogCancel>
              <button
                type="submit"
                disabled={!matches || busy}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                Delete interaction
              </button>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
