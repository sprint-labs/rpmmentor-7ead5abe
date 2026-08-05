import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { RequirePermission } from "@/components/require-permission";
import { Card } from "@/components/primitives";
import { getPlayer, updatePlayerClub } from "@/lib/players.functions";

export const Route = createFileRoute("/system/players/$playerId")({
  component: PlayerRecordPage,
  head: () => ({
    meta: [
      { title: "Edit Player Record · Mentor Hub" },
      { name: "description", content: "Edit the current club stored on a canonical Mentor Hub player record." },
      { property: "og:title", content: "Edit Player Record · Mentor Hub" },
      { property: "og:description", content: "Edit the current club on a canonical player record." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PlayerRecordPage() {
  return (
    <RequirePermission permission="system.manage">
      <PlayerRecordEditor />
    </RequirePermission>
  );
}

function PlayerRecordEditor() {
  const { playerId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchPlayer = useServerFn(getPlayer);
  const saveClub = useServerFn(updatePlayerClub);

  const { data: player, isLoading, error } = useQuery({
    queryKey: ["player", playerId],
    queryFn: () => fetchPlayer({ data: { id: playerId } }),
    retry: false,
  });

  const [club, setClub] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedClub, setSavedClub] = useState<string | null>(null);

  useEffect(() => {
    // Load the persisted value once; never overwrite what the user typed.
    if (player && !dirty) setClub(player.current_club ?? "");
  }, [player, dirty]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !club.trim()) return;
    setSaving(true);
    setSaveError(null);
    setSavedClub(null);
    try {
      // Success only after the server read-back confirms the persisted value.
      const confirmed = await saveClub({ data: { id: playerId, currentClub: club.trim() } });
      if (!confirmed?.id || confirmed.current_club !== club.trim()) {
        throw new Error("The saved club could not be confirmed.");
      }
      setSavedClub(confirmed.current_club);
      setDirty(false);
      queryClient.setQueryData(["player", playerId], confirmed);
      await queryClient.invalidateQueries({ queryKey: ["players", "roster"] });
    } catch (err) {
      // Entered value is retained so nothing is lost on a recoverable failure.
      setSaveError(err instanceof Error ? err.message : "Club was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-xl">
      <Link to="/system/players" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All player records
      </Link>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading player record…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load this player record."}
        </p>
      ) : !player ? (
        <p className="text-sm text-muted-foreground">Player record not found.</p>
      ) : (
        <Card className="p-5 space-y-4">
          <div>
            <h1 className="text-lg font-semibold">{player.full_name}</h1>
            <p className="text-xs text-muted-foreground">Canonical player record · {player.id}</p>
          </div>

          {saveError && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="font-medium">Club was not saved.</span> {saveError} Your entry has been kept.
            </div>
          )}
          {savedClub && !saveError && (
            <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
              Club saved — now stored as “{savedClub}”.
            </div>
          )}

          <form aria-label="Edit player club form" onSubmit={handleSubmit} className="space-y-3">
            <fieldset disabled={saving} className="space-y-3 border-0 p-0 m-0 min-w-0">
              <div>
                <label htmlFor="player-current-club" className="block text-xs font-medium mb-1">
                  Current club
                </label>
                <input
                  id="player-current-club"
                  aria-label="Current club"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={club}
                  maxLength={120}
                  onChange={(e) => { setClub(e.target.value); setDirty(true); setSavedClub(null); }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Saved value: {player.current_club || "—"}</p>
              </div>
              <button
                type="submit"
                disabled={saving || !club.trim() || club.trim() === (player.current_club ?? "")}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {saving ? "Saving…" : "Save club"}
              </button>
            </fieldset>
          </form>
        </Card>
      )}
    </div>
  );
}
