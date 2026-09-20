/**
 * Duty-of-care status for one goalkeeper, with the management-only reset.
 *
 * The badge reads `public.player_duty_of_care`, which is the `duty_of_care_at()`
 * projection — nothing is recalculated on the client. "Reset duty of care" is
 * rendered only for roles holding `duty_of_care.reset`, but that is
 * presentation only: `resetDutyOfCare` re-checks the caller's role and the
 * `duty_of_care_resets_insert_managers` RLS policy enforces it again.
 *
 * A recorded reset changes the status straight away, so the badge query is
 * invalidated before the dialog closes.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, DutyBadge, SectionTitle } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { getPlayerDutyOfCare, resetDutyOfCare } from "@/lib/duty-of-care.functions";
import { dutyLevelFromState } from "@/lib/duty-of-care-status";
import { formatDate } from "@/lib/mock-data";
import { refreshDutyOfCareViews } from "@/lib/query-refresh";

const dutyOfCareQueryKey = (playerId: string) => ["duty-of-care", playerId] as const;

const REASON_MAX = 500;

export function DutyOfCarePanel({
  playerId,
  playerName,
  compact = false,
}: {
  /** Canonical `players.id`. Without one there is no duty-of-care row to read. */
  playerId: string | null;
  playerName: string;
  /**
   * Stack the panel and quieten the reset control, for the narrower profile
   * sidebar. The status itself is unchanged — only how loudly it is shown.
   */
  compact?: boolean;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const getDuty = useServerFn(getPlayerDutyOfCare);

  const { data, isLoading, isError } = useQuery({
    queryKey: dutyOfCareQueryKey(playerId ?? "none"),
    queryFn: () => getDuty({ data: { player_id: playerId! } }),
    enabled: !!playerId,
    staleTime: 60_000,
  });

  if (!playerId) return null;

  const level = dutyLevelFromState(data?.state);
  const label = isLoading
    ? "Loading…"
    : isError
      ? "Unavailable"
      : (data?.status_label ?? "Not enough data");

  return (
    <Card className="p-4">
      <div
        className={
          compact ? "flex flex-col gap-2" : "flex flex-wrap items-center justify-between gap-3"
        }
      >
        <div className="min-w-0">
          <SectionTitle>Duty of Care</SectionTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <DutyBadge level={level} label={label} />
            {data?.last_interaction_at && (
              <span className="text-xs text-muted-foreground">
                Last live contact {formatDate(data.last_interaction_at)}
              </span>
            )}
            {data?.next_due_at && (
              <span className="text-xs text-muted-foreground">
                · Next due {formatDate(data.next_due_at)}
              </span>
            )}
          </div>
        </div>
        {can("duty_of_care.reset") && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={
              compact
                ? "inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs"
                : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm"
            }
          >
            <RotateCcw className="size-3.5" /> Reset duty of care
          </button>
        )}
      </div>
      {open && (
        <ResetDutyOfCareDialog
          playerId={playerId}
          playerName={playerName}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  );
}

function ResetDutyOfCareDialog({
  playerId,
  playerName,
  onClose,
}: {
  playerId: string;
  playerName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const saveReset = useServerFn(resetDutyOfCare);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const confirmed = await saveReset({
        data: { player_id: playerId, reason: reason.trim() },
      });
      if (!confirmed?.id) {
        throw new Error("The reset could not be confirmed.");
      }
      await refreshDutyOfCareViews(queryClient, playerId);
      toast.success("Duty of care reset", {
        description: `${playerName}'s duty-of-care clock now starts from ${formatDate(confirmed.reset_at)}.`,
      });
      onClose();
    } catch (err) {
      // The typed reason is kept so a recoverable failure loses nothing.
      setError(err instanceof Error ? err.message : "The reset was not recorded.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Reset duty of care for ${playerName}`}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">Reset duty of care</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {playerName} · the clock restarts from now. Logged interactions are not changed.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span className="font-medium">The reset was not recorded.</span> {error} Your entry has
            been kept.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <div>
              <label htmlFor="duty-reset-reason" className="mb-1 block text-xs font-medium">
                Reason <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="duty-reset-reason"
                aria-label="Reason"
                autoFocus
                rows={3}
                maxLength={REASON_MAX}
                placeholder="Why is the clock being reset?"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-md border border-border px-3 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {saving ? "Resetting…" : "Reset duty of care"}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
