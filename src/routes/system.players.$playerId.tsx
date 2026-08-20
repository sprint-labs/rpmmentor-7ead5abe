import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/require-permission";
import { Card } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import {
  deletePlayerRecord,
  getPlayer,
  getPlayerDeletionImpact,
  playerDeletionBlockMessage,
  updatePlayerClub,
  updatePlayerRecord,
  type PlayerRosterRow,
} from "@/lib/players.functions";
import { refreshClubDependentViews } from "@/lib/query-refresh";

export const Route = createFileRoute("/system/players/$playerId")({
  component: PlayerRecordPage,
  head: () => ({
    meta: [
      { title: "Edit Player Record · Mentor Hub" },
      {
        name: "description",
        content: "Correct or recoverably delete a canonical Mentor Hub player record.",
      },
      { property: "og:title", content: "Edit Player Record · Mentor Hub" },
      {
        property: "og:description",
        content: "Correct or recoverably delete a canonical player record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface PlayerDraft {
  currentClub: string;
  parentClub: string;
  onLoan: boolean;
  league: string;
  nationality: string;
  instagramUrl: string;
  contractUntil: string;
}

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

function draftFrom(player: PlayerRosterRow): PlayerDraft {
  return {
    currentClub: player.current_club ?? "",
    parentClub: player.parent_club ?? "",
    onLoan: player.on_loan,
    league: player.league ?? "",
    nationality: player.nationality ?? "",
    instagramUrl: player.instagram_url ?? "",
    contractUntil: player.contract_until ?? "",
  };
}

function PlayerRecordPage() {
  return (
    <RequirePermission permission="players.edit_club">
      <PlayerRecordEditor />
    </RequirePermission>
  );
}

function PlayerRecordEditor() {
  const { playerId } = Route.useParams();
  const { can } = useAuth();
  const canManage = can("players.manage");
  const navigate = useNavigate({ from: "/system/players/$playerId" });
  const queryClient = useQueryClient();
  const fetchPlayer = useServerFn(getPlayer);
  const saveClub = useServerFn(updatePlayerClub);
  const saveRecord = useServerFn(updatePlayerRecord);
  const fetchDeletionImpact = useServerFn(getPlayerDeletionImpact);
  const deleteRecord = useServerFn(deletePlayerRecord);

  const {
    data: player,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["player", playerId],
    queryFn: () => fetchPlayer({ data: { id: playerId } }),
    retry: false,
  });

  const [draft, setDraft] = useState<PlayerDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    if (player && !dirty) setDraft(draftFrom(player));
  }, [player, dirty]);

  const impactQuery = useQuery({
    queryKey: ["player", playerId, "deletion-impact"],
    queryFn: () => fetchDeletionImpact({ data: { id: playerId } }),
    enabled: deleteOpen && canManage,
    retry: false,
  });
  const deletionBlocked = impactQuery.data ? playerDeletionBlockMessage(impactQuery.data) : null;

  const updateDraft = <K extends keyof PlayerDraft>(key: K, value: PlayerDraft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    setSaved(false);
    setSaveError(null);
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!player || !draft || saving || !draft.currentClub.trim()) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const confirmed = canManage
        ? await saveRecord({
            data: {
              id: playerId,
              currentClub: draft.currentClub,
              parentClub: draft.parentClub,
              onLoan: draft.onLoan,
              league: draft.league,
              nationality: draft.nationality,
              instagramUrl: draft.instagramUrl,
              contractUntil: draft.contractUntil,
            },
          })
        : await saveClub({ data: { id: playerId, currentClub: draft.currentClub.trim() } });
      if (!confirmed?.id) throw new Error("The saved player record could not be confirmed.");
      queryClient.setQueryData(["player", playerId], confirmed);
      setDraft(draftFrom(confirmed));
      setDirty(false);
      setSaved(true);
      await refreshClubDependentViews(queryClient, playerId);
      toast.success("Player record updated");
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : "Player record was not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !player ||
      deleteBusy ||
      impactQuery.isLoading ||
      impactQuery.isError ||
      deletionBlocked ||
      typedName.trim() !== player.full_name
    ) {
      return;
    }
    setDeleteBusy(true);
    try {
      const result = await deleteRecord({ data: { id: playerId } });
      if (!result.deleted) {
        toast.error("This player record is no longer available to delete.");
        return;
      }
      await refreshClubDependentViews(queryClient, playerId);
      setDeleteOpen(false);
      toast.success("Player record deleted from active use");
      await navigate({ to: "/system/players" });
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not delete the player record.",
      );
      await impactQuery.refetch();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <Link
        to="/system/players"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All player records
      </Link>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading player record…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load this player record."}
        </p>
      ) : !player || !draft ? (
        <p className="text-sm text-muted-foreground">Player record not found.</p>
      ) : (
        <>
          <Card className="p-5 space-y-4">
            <div>
              <h1 className="text-lg font-semibold">{player.full_name}</h1>
              <p className="text-xs text-muted-foreground">Canonical player record · {player.id}</p>
              {canManage && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Name and record ID are locked in this version because legacy goalkeeper profiles
                  still use the name as part of their identity.
                </p>
              )}
            </div>

            {saveError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <span className="font-medium">Record was not saved.</span> {saveError} Your entries
                have been kept.
              </div>
            )}
            {saved && !saveError && (
              <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
                Player record saved and confirmed.
              </div>
            )}

            <form
              aria-label="Edit player record form"
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <fieldset
                disabled={saving}
                className="grid gap-3 border-0 p-0 m-0 min-w-0 sm:grid-cols-2"
              >
                <Field label="Current club" required>
                  <input
                    aria-label="Current club"
                    className={FIELD_INPUT_CLASS}
                    value={draft.currentClub}
                    maxLength={120}
                    onChange={(event) => updateDraft("currentClub", event.target.value)}
                  />
                </Field>

                {canManage && (
                  <>
                    <Field label="Parent club">
                      <input
                        aria-label="Parent club"
                        className={FIELD_INPUT_CLASS}
                        value={draft.parentClub}
                        maxLength={120}
                        onChange={(event) => updateDraft("parentClub", event.target.value)}
                      />
                    </Field>
                    <Field label="League">
                      <input
                        aria-label="League"
                        className={FIELD_INPUT_CLASS}
                        value={draft.league}
                        maxLength={120}
                        onChange={(event) => updateDraft("league", event.target.value)}
                      />
                    </Field>
                    <Field label="Nationality">
                      <input
                        aria-label="Nationality"
                        className={FIELD_INPUT_CLASS}
                        value={draft.nationality}
                        maxLength={120}
                        onChange={(event) => updateDraft("nationality", event.target.value)}
                      />
                    </Field>
                    <Field label="Instagram URL">
                      <input
                        aria-label="Instagram URL"
                        className={FIELD_INPUT_CLASS}
                        type="url"
                        placeholder="https://…"
                        value={draft.instagramUrl}
                        maxLength={500}
                        onChange={(event) => updateDraft("instagramUrl", event.target.value)}
                      />
                    </Field>
                    <Field label="Contract until">
                      <input
                        aria-label="Contract until"
                        className={FIELD_INPUT_CLASS}
                        value={draft.contractUntil}
                        maxLength={120}
                        onChange={(event) => updateDraft("contractUntil", event.target.value)}
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end rounded-md border border-border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.onLoan}
                        onChange={(event) => updateDraft("onLoan", event.target.checked)}
                      />
                      Currently on loan
                    </label>
                  </>
                )}
              </fieldset>

              <Button type="submit" disabled={saving || !dirty || !draft.currentClub.trim()}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "Saving…" : canManage ? "Save player record" : "Save club"}
              </Button>
            </form>
          </Card>

          {canManage && (
            <Card className="border-destructive/30 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Delete player record</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Removes it from operational rosters while retaining the source row and links to
                    historical activity. Legacy static goalkeeper profiles are separate and are not
                    removed by this control.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setTypedName("");
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 /> Delete record
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteBusy) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {player?.full_name ?? "this player record"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  The player will disappear from active operational rosters. The canonical row and
                  historical interaction and calendar links are retained for recovery. Any legacy
                  static goalkeeper profile remains separate.
                </p>
                {impactQuery.isLoading && <p>Checking linked records…</p>}
                {impactQuery.isError && (
                  <p className="text-destructive">
                    Linked records could not be checked. Deletion is blocked.
                  </p>
                )}
                {impactQuery.data && (
                  <p>
                    Retained history: {impactQuery.data.interactionCount} active interaction
                    {impactQuery.data.interactionCount === 1 ? "" : "s"}.
                  </p>
                )}
                {deletionBlocked && (
                  <p className="font-medium text-destructive">{deletionBlocked}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label className="block space-y-1.5 text-sm">
            <span>
              Type <strong>{player?.full_name}</strong> to confirm
            </span>
            <input
              aria-label="Type player name to confirm deletion"
              className={FIELD_INPUT_CLASS}
              autoComplete="off"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
            />
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                deleteBusy ||
                impactQuery.isLoading ||
                impactQuery.isError ||
                Boolean(deletionBlocked) ||
                !player ||
                typedName.trim() !== player.full_name
              }
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete player record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
