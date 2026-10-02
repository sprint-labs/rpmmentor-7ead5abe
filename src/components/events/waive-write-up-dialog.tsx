import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { waiveEventFollowUp, waiveMyEventFollowUp } from "@/lib/events/follow-up.functions";
import { eventFollowUpsQueryKey } from "@/lib/events/query-keys";
import { formatDateOnly } from "@/lib/interactions/schema";

export interface WaiveWriteUpTarget {
  eventId: string;
  title: string;
  goalkeeperName: string | null;
  eventDate: string;
  /** True when the event is assigned to the signed-in user. */
  mine: boolean;
}

export const DEFAULT_WAIVE_REASON = "I did not attend this event.";

/**
 * Mark an outstanding write-up as not required, with a reason. The caller's
 * own event goes through the waiver limited to events assigned to them; a
 * manager acting on someone else's event uses the team-wide one. The server
 * re-checks either way.
 */
export function WaiveWriteUpDialog({
  target,
  onClose,
}: {
  target: WaiveWriteUpTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const waiveAny = useServerFn(waiveEventFollowUp);
  const waiveMine = useServerFn(waiveMyEventFollowUp);
  const [reason, setReason] = useState(DEFAULT_WAIVE_REASON);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason(DEFAULT_WAIVE_REASON);
    setBusy(false);
  }, [target?.eventId]);

  if (!target) return null;
  const trimmed = reason.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const waive = target.mine ? waiveMine : waiveAny;
      await waive({ data: { id: target.eventId, reason: trimmed } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventFollowUpsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
        queryClient.invalidateQueries({ queryKey: ["mentor-dashboard-stats"] }),
      ]);
      toast.success("Write-up marked not required.");
      onClose();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not remove the write-up.");
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>No write-up needed?</AlertDialogTitle>
            <AlertDialogDescription>
              {target.goalkeeperName || "No goalkeeper linked"} · {target.title} ·{" "}
              {formatDateOnly(target.eventDate)}. It comes off the Write-ups Due list. The event
              stays on the calendar, and a Mentor Manager can put the write-up back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs text-muted-foreground">Reason (required)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </label>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel type="button" disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <button
              type="submit"
              disabled={!trimmed || busy}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Remove write-up
            </button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
