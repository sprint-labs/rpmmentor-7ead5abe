/**
 * Inline "Update club" correction, offered wherever an out-of-date club is
 * displayed rather than only on the Player Records admin screen.
 *
 * The button is only rendered for roles that hold `players.edit_club`, but that
 * is presentation only — `updatePlayerClub` re-checks the caller's role, RLS
 * enforces it again, and a database trigger stops any column other than
 * `current_club` being touched. Success is shown only after the server has read
 * the stored value back.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { updatePlayerClub } from "@/lib/players.functions";
import { refreshClubDependentViews } from "@/lib/query-refresh";

export function UpdateClubButton({
  playerId,
  playerName,
  currentClub,
}: {
  /** Canonical `players.id`. Without one there is no record to correct. */
  playerId: string | null;
  playerName: string;
  currentClub: string;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!playerId || !can("players.edit_club")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Pencil className="size-3" /> Update club
      </button>
      {open && (
        <UpdateClubDialog
          playerId={playerId}
          playerName={playerName}
          currentClub={currentClub}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function UpdateClubDialog({
  playerId,
  playerName,
  currentClub,
  onClose,
}: {
  playerId: string;
  playerName: string;
  currentClub: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const saveClub = useServerFn(updatePlayerClub);
  const [club, setClub] = useState(currentClub);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = club.trim();
  const canSave = !saving && trimmed.length > 0 && trimmed !== currentClub.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const confirmed = await saveClub({ data: { id: playerId, currentClub: trimmed } });
      // The server already reads back; re-assert it here so a partial or
      // unexpected response can never be presented as a success.
      if (!confirmed?.id || confirmed.current_club !== trimmed) {
        throw new Error("The saved club could not be confirmed.");
      }
      queryClient.setQueryData(["player", playerId], confirmed);
      await refreshClubDependentViews(queryClient, playerId);
      toast.success("Club updated", {
        description: `${playerName} is now recorded at ${confirmed.current_club}.`,
      });
      onClose();
    } catch (err) {
      // The typed value is kept so a recoverable failure loses nothing.
      setError(err instanceof Error ? err.message : "Club was not saved.");
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
        aria-label={`Update club for ${playerName}`}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">Update club</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {playerName} · currently {currentClub || "not recorded"}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span className="font-medium">Club was not saved.</span> {error} Your entry has been
            kept.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <div>
              <label htmlFor="inline-current-club" className="mb-1 block text-xs font-medium">
                Current club
              </label>
              <input
                id="inline-current-club"
                aria-label="Current club"
                autoFocus
                maxLength={120}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={club}
                onChange={(e) => setClub(e.target.value)}
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
                disabled={!canSave}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {saving ? "Saving…" : "Save club"}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
