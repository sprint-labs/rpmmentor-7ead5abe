/**
 * "Edit Details" — the single, inline correction path for a goalkeeper's
 * personal details, offered wherever the profile is shown.
 *
 * There is deliberately no parallel player-details store behind this. Every
 * field maps to a column on `public.players` and is written through the
 * existing server functions (`updatePlayerClub`, `updatePlayerTier`,
 * `updatePlayerRecord`), each of which re-checks the caller's role and reads
 * the stored value back before reporting success.
 *
 * Who may change what is decided by the database, not by this dialog:
 *   - the `players_update_club_authorised` RLS policy admits Mentor Manager,
 *     Admin and Super Admin to UPDATE `players` at all — so Mentors never see
 *     the button;
 *   - the `players_guard_club_only_update` trigger then narrows those roles to
 *     `current_club`, `tier` and `tier_effective_from`. Every other column,
 *     Nationality included, remains Super Admin only.
 *
 * The form mirrors that split rather than hiding it: a Mentor Manager sees the
 * whole record and is told plainly which parts only a Super Admin can change,
 * instead of meeting a database error after typing. Widening that would mean a
 * migration to the trigger, which is a security decision, not a UI one.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  PLAYER_TIER_VALUES,
  updatePlayerClub,
  updatePlayerRecord,
  updatePlayerTier,
  type PlayerRosterRow,
} from "@/lib/players.functions";
import { refreshClubDependentViews } from "@/lib/query-refresh";

/** The editable shape of a player record, as strings the form can hold. */
interface DetailsForm {
  currentClub: string;
  parentClub: string;
  onLoan: boolean;
  league: string;
  /** `players.nationality`, shown throughout the app as "Nationality". */
  nationality: string;
  /** Statuses, independent of tier — a Tier 1 goalkeeper can also be Academy. */
  isAcademy: boolean;
  isFreeAgent: boolean;
  instagramUrl: string;
  contractUntil: string;
  tier: string;
}

function formFromPlayer(player: PlayerRosterRow | null, fallbackClub: string): DetailsForm {
  return {
    currentClub: player?.current_club ?? fallbackClub ?? "",
    parentClub: player?.parent_club ?? "",
    onLoan: player?.on_loan ?? false,
    league: player?.league ?? "",
    nationality: player?.nationality ?? "",
    isAcademy: player?.is_academy ?? false,
    isFreeAgent: player?.is_free_agent ?? false,
    instagramUrl: player?.instagram_url ?? "",
    contractUntil: player?.contract_until ?? "",
    tier: player?.tier ?? "",
  };
}

export function EditDetailsButton({
  player,
  playerId,
  playerName,
  currentClub,
}: {
  /** The canonical roster row, when one has been matched. */
  player: PlayerRosterRow | null;
  /** Canonical `players.id`. Without one there is no record to correct. */
  playerId: string | null;
  playerName: string;
  currentClub: string;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  // `players.edit_club` is held by Mentor Manager, Admin and Super Admin, and
  // by no one else — the same three roles the RLS policy admits.
  if (!playerId || !can("players.edit_club")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-primary-ink hover:underline"
      >
        <Pencil className="size-3" /> Edit Details
      </button>
      {open && (
        <EditDetailsDialog
          player={player}
          playerId={playerId}
          playerName={playerName}
          currentClub={currentClub}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const FIELD_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60";

function EditDetailsDialog({
  player,
  playerId,
  playerName,
  currentClub,
  onClose,
}: {
  player: PlayerRosterRow | null;
  playerId: string;
  playerName: string;
  currentClub: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const saveClub = useServerFn(updatePlayerClub);
  const saveTier = useServerFn(updatePlayerTier);
  const saveRecord = useServerFn(updatePlayerRecord);

  const initial = formFromPlayer(player, currentClub);
  const [form, setForm] = useState<DetailsForm>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === "super_admin";
  const set = <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const club = form.currentClub.trim();
  const changed = (Object.keys(initial) as (keyof DetailsForm)[]).some((key) =>
    typeof initial[key] === "string"
      ? String(form[key]).trim() !== String(initial[key]).trim()
      : form[key] !== initial[key],
  );
  const canSave = !saving && club.length > 0 && changed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (isSuperAdmin) {
        // One write for the whole record, guarded and read back server-side.
        const confirmed = await saveRecord({
          data: {
            id: playerId,
            currentClub: club,
            parentClub: form.parentClub,
            onLoan: form.onLoan,
            league: form.league,
            nationality: form.nationality,
            instagramUrl: form.instagramUrl,
            contractUntil: form.contractUntil,
            tier: form.tier as (typeof PLAYER_TIER_VALUES)[number] | "",
            isAcademy: form.isAcademy,
            isFreeAgent: form.isFreeAgent,
          },
        });
        if (!confirmed?.id) throw new Error("The saved details could not be confirmed.");
        queryClient.setQueryData(["player", playerId], confirmed);
      } else {
        // Mentor Manager / Admin: only the columns the database lets them
        // touch, and only the ones they actually changed.
        let confirmed: PlayerRosterRow | null = null;
        if (club !== initial.currentClub.trim()) {
          confirmed = await saveClub({ data: { id: playerId, currentClub: club } });
        }
        if (form.tier !== initial.tier) {
          confirmed = await saveTier({
            data: { id: playerId, tier: form.tier as (typeof PLAYER_TIER_VALUES)[number] | "" },
          });
        }
        if (!confirmed?.id) throw new Error("The saved details could not be confirmed.");
        queryClient.setQueryData(["player", playerId], confirmed);
      }
      await refreshClubDependentViews(queryClient, playerId);
      toast.success("Details updated", { description: `${playerName}'s record has been saved.` });
      onClose();
    } catch (err) {
      // The typed values are kept so a recoverable failure loses nothing.
      setError(err instanceof Error ? err.message : "Details were not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit details for ${playerName}`}
        className="my-auto w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">Edit Details</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {playerName} · currently {currentClub || "club not recorded"}
        </p>

        {!isSuperAdmin && (
          <p className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            You can change the club and tier. Nationality, league, loan status, contract, Instagram,
            Academy and Free Agent are held to Super Admin by the database.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span className="font-medium">Details were not saved.</span> {error} Your entries have
            been kept.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="edit-current-club" label="Current club">
                <input
                  id="edit-current-club"
                  autoFocus
                  maxLength={120}
                  className={FIELD_CLASS}
                  value={form.currentClub}
                  onChange={(e) => set("currentClub", e.target.value)}
                />
              </Field>

              <Field id="edit-tier" label="Tier">
                <select
                  id="edit-tier"
                  className={FIELD_CLASS}
                  value={form.tier}
                  onChange={(e) => set("tier", e.target.value)}
                >
                  <option value="">Not tiered</option>
                  {PLAYER_TIER_VALUES.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </Field>

              <Field id="edit-nationality" label="Nationality">
                <input
                  id="edit-nationality"
                  maxLength={120}
                  disabled={!isSuperAdmin}
                  className={FIELD_CLASS}
                  value={form.nationality}
                  onChange={(e) => set("nationality", e.target.value)}
                />
              </Field>

              <Field id="edit-league" label="League">
                <input
                  id="edit-league"
                  maxLength={120}
                  disabled={!isSuperAdmin}
                  className={FIELD_CLASS}
                  value={form.league}
                  onChange={(e) => set("league", e.target.value)}
                />
              </Field>

              <Field id="edit-parent-club" label="Parent club">
                <input
                  id="edit-parent-club"
                  maxLength={120}
                  disabled={!isSuperAdmin}
                  className={FIELD_CLASS}
                  value={form.parentClub}
                  onChange={(e) => set("parentClub", e.target.value)}
                />
              </Field>

              <Field id="edit-contract-until" label="Contract until">
                <input
                  id="edit-contract-until"
                  maxLength={120}
                  placeholder="YYYY-MM-DD"
                  disabled={!isSuperAdmin}
                  className={FIELD_CLASS}
                  value={form.contractUntil}
                  onChange={(e) => set("contractUntil", e.target.value)}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field id="edit-instagram" label="Instagram URL">
                  <input
                    id="edit-instagram"
                    type="url"
                    maxLength={500}
                    placeholder="https://instagram.com/…"
                    disabled={!isSuperAdmin}
                    className={FIELD_CLASS}
                    value={form.instagramUrl}
                    onChange={(e) => set("instagramUrl", e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    className="size-4 rounded border-border accent-primary disabled:opacity-60"
                    checked={form.onLoan}
                    onChange={(e) => set("onLoan", e.target.checked)}
                  />
                  On loan
                </label>
                {/* Statuses, not tiers. A goalkeeper keeps their care-cadence
                    tier while holding either of these. */}
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    className="size-4 rounded border-border accent-primary disabled:opacity-60"
                    checked={form.isAcademy}
                    onChange={(e) => set("isAcademy", e.target.checked)}
                  />
                  Academy
                </label>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    className="size-4 rounded border-border accent-primary disabled:opacity-60"
                    checked={form.isFreeAgent}
                    onChange={(e) => set("isFreeAgent", e.target.checked)}
                  />
                  Free Agent
                </label>
              </div>
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
                {saving ? "Saving…" : "Save details"}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
