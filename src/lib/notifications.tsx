import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { DutyLevel } from "./mock-data";
import { listPlayerDutyOfCare } from "./duty-of-care.functions";
import { listPlayers } from "./players.functions";
import {
  dutyLevelChanges,
  dutyLevelSnapshot,
  isDutyLevelResolved,
  liveDutyEntries,
  pruneResolvedDutyLevels,
  seedFromLiveLevels,
  type DutyNotif,
  type ResolvedDutyLevels,
} from "./duty-notifications";
import { useAuth } from "./auth";

export { isDutyLevelResolved, pruneResolvedDutyLevels, type DutyNotif, type ResolvedDutyLevels };

export type EmailFrequency = "off" | "daily" | "weekly";
export interface EmailPrefs { frequency: EmailFrequency; recipients: string[]; lastSent?: string }

const STORAGE_KEY = "rpm.notifications.v1";
const PREFS_KEY = "rpm.notif.prefs.v1";
const SNAPSHOT_KEY = "rpm.duty.snapshot.v1";
const RESOLVED_KEY = "rpm.duty.resolved.v1";

interface Ctx {
  items: DutyNotif[];
  unread: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  resolve: (id: string) => void;
  clearAll: () => void;
  prefs: EmailPrefs;
  setPrefs: (p: EmailPrefs) => void;
  sendSummaryNow: () => void;
}

const C = createContext<Ctx | null>(null);

function load<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = window.localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function persist(k: string, v: unknown) { if (typeof window !== "undefined") { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } }

const RANK: Record<DutyLevel, number> = {
  not_required: 0, up_to_date: 1, not_enough_data: 2, due_soon: 3, overdue: 4,
};
function rank(l: DutyLevel) { return RANK[l]; }
export function severityFor(from: DutyLevel, to: DutyLevel): "high" | "medium" | "low" {
  if (to === "overdue" && rank(to) > rank(from)) return "high";
  if (rank(to) > rank(from)) return "medium";
  return "low";
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, can } = useAuth();
  const canViewDutyNotifications = Boolean(user) && can("alerts.view");
  const [items, setItems] = useState<DutyNotif[]>(() => load(STORAGE_KEY, [] as DutyNotif[]));
  const [prefs, setPrefsState] = useState<EmailPrefs>(() =>
    load(PREFS_KEY, { frequency: "weekly", recipients: ["operations@refuelpm.com"] } as EmailPrefs),
  );
  const [resolved, setResolved] = useState<ResolvedDutyLevels>(() =>
    load(RESOLVED_KEY, {} as ResolvedDutyLevels),
  );

  // Duty of Care comes from `public.player_duty_of_care` — the
  // `duty_of_care_at()` projection — and the roster from `public.players`.
  // These are the query keys `/goalkeepers` and the dashboard already use, so
  // the three surfaces share one cached answer and cannot disagree about a
  // goalkeeper. Both are gated on the permission because the provider is
  // mounted on every route, including `/login`.
  const listPlayersFn = useServerFn(listPlayers);
  const { data: playerRows } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
    enabled: canViewDutyNotifications,
  });

  const dutyListFn = useServerFn(listPlayerDutyOfCare);
  const { data: dutyRows } = useQuery({
    queryKey: ["duty-of-care", "roster"],
    queryFn: () => dutyListFn(),
    staleTime: 60_000,
    enabled: canViewDutyNotifications,
  });

  // `null` until both reads have answered. A pending or failed read is not the
  // same as "every goalkeeper is at not_enough_data", and snapshotting that
  // difference would invent a change for the whole roster.
  const liveLevels = useMemo(
    () => (playerRows && dutyRows ? liveDutyEntries(playerRows, dutyRows) : null),
    [playerRows, dutyRows],
  );

  useEffect(() => {
    if (!canViewDutyNotifications) return;
    if (!liveLevels?.length) return;

    const snap = load<Record<string, DutyLevel>>(SNAPSHOT_KEY, {});
    const first = Object.keys(snap).length === 0;
    const acknowledged = load<ResolvedDutyLevels>(RESOLVED_KEY, {});

    // The snapshot keeps its legacy `gk-…` key space, so the one already in
    // this browser still matches and nothing is re-announced. A goalkeeper who
    // is new to the snapshot — a signing, or a first load — is recorded without
    // an alert, which is what stops a burst here.
    const current = dutyLevelSnapshot(liveLevels);
    const fresh = dutyLevelChanges(liveLevels, snap, acknowledged);
    persist(SNAPSHOT_KEY, current);

    // A resolution only silences the level it acknowledged. Once a goalkeeper
    // moves, the stale entry is dropped so the next change is announced.
    const stillResolved = pruneResolvedDutyLevels(acknowledged, current);
    setResolved(stillResolved);
    persist(RESOLVED_KEY, stillResolved);

    if (first && items.length === 0) {
      const seeded = seedFromLiveLevels(liveLevels).filter(
        (n) => !isDutyLevelResolved(stillResolved, n.gkId, n.to),
      );
      setItems(seeded);
      persist(STORAGE_KEY, seeded);
    } else if (fresh.length) {
      fresh.forEach((n) => {
        const verb = rank(n.to) > rank(n.from) ? "escalated" : "improved";
        const fn = n.to === "overdue" ? toast.error : n.to === "due_soon" ? toast.warning : toast.success;
        const label = (l: DutyLevel) => l.replace(/_/g, " ").toUpperCase();
        fn(`Duty ${verb}: ${n.gkName}`, { description: `${label(n.from)} → ${label(n.to)}` });
      });
      setItems((prev) => {
        const next = [...fresh, ...prev].slice(0, 80);
        persist(STORAGE_KEY, next);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewDutyNotifications, liveLevels]);

  const setPrefs = (p: EmailPrefs) => { setPrefsState(p); persist(PREFS_KEY, p); };
  const markAllRead = () => setItems((p) => { const n = p.map((x) => ({ ...x, read: true })); persist(STORAGE_KEY, n); return n; });
  const markRead = (id: string) => setItems((p) => { const n = p.map((x) => (x.id === id ? { ...x, read: true } : x)); persist(STORAGE_KEY, n); return n; });

  /**
   * Fail-safe dismissal. Removes every copy of this goalkeeper's current duty
   * level from the list and records the acknowledgement, so a derived alert
   * that would otherwise be regenerated on the next load stays gone.
   */
  const resolve = (id: string) => {
    const target = items.find((x) => x.id === id);
    if (!target) return;
    const nextResolved = { ...resolved, [target.gkId]: target.to };
    setResolved(nextResolved);
    persist(RESOLVED_KEY, nextResolved);
    const next = items.filter((x) => !(x.gkId === target.gkId && x.to === target.to));
    setItems(next);
    persist(STORAGE_KEY, next);
  };

  const clearAll = () => { setItems([]); persist(STORAGE_KEY, []); };

  const sendSummaryNow = () => {
    const attn = items.filter((i) => i.to === "overdue" || i.to === "due_soon").length;
    const recipients = prefs.recipients.filter(Boolean);
    if (!recipients.length) { toast.error("Add at least one recipient first"); return; }
    const next = { ...prefs, lastSent: new Date().toISOString() };
    setPrefs(next);
    toast.success("Duty-of-care summary queued", {
      description: `${attn} needing attention · delivered to ${recipients.join(", ")}`,
    });
  };

  const unread = useMemo(
    () => (canViewDutyNotifications ? items.filter((i) => !i.read).length : 0),
    [items, canViewDutyNotifications],
  );

  return (
    <C.Provider
      value={{
        items: canViewDutyNotifications ? items : [],
        unread,
        markAllRead,
        markRead,
        resolve,
        clearAll,
        prefs,
        setPrefs,
        sendSummaryNow,
      }}
    >
      {children}
    </C.Provider>
  );
}

export function useNotifications() {
  const v = useContext(C);
  if (!v) throw new Error("NotificationsProvider missing");
  return v;
}
