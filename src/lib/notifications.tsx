import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { goalkeepers, dutyStatusForGk, type DutyLevel } from "./mock-data";

export type DutyNotif = {
  id: string;
  gkId: string;
  gkName: string;
  from: DutyLevel;
  to: DutyLevel;
  date: string;
  read: boolean;
};

export type EmailFrequency = "off" | "daily" | "weekly";
export interface EmailPrefs {
  frequency: EmailFrequency;
  recipients: string[];
  lastSent?: string;
}

const STORAGE_KEY = "rpm.notifications.v1";
const PREFS_KEY = "rpm.notif.prefs.v1";
const SNAPSHOT_KEY = "rpm.duty.snapshot.v1";

interface Ctx {
  items: DutyNotif[];
  unread: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  prefs: EmailPrefs;
  setPrefs: (p: EmailPrefs) => void;
  sendSummaryNow: () => void;
}

const C = createContext<Ctx | null>(null);

function load<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persist(k: string, v: unknown) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }
}

const RANK: Record<DutyLevel, number> = {
  not_required: 0,
  up_to_date: 1,
  not_enough_data: 2,
  due_soon: 3,
  overdue: 4,
};
function rank(l: DutyLevel) {
  return RANK[l];
}
export function severityFor(from: DutyLevel, to: DutyLevel): "high" | "medium" | "low" {
  if (to === "overdue" && rank(to) > rank(from)) return "high";
  if (rank(to) > rank(from)) return "medium";
  return "low";
}

function seedFromCurrent(): DutyNotif[] {
  const out: DutyNotif[] = [];
  goalkeepers.forEach((gk, i) => {
    const cur = dutyStatusForGk(gk).level;
    if (cur === "up_to_date" || cur === "not_required") return;
    const from: DutyLevel = "up_to_date";
    out.push({
      id: `seed-${gk.id}`,
      gkId: gk.id,
      gkName: gk.name,
      from,
      to: cur,
      date: new Date(Date.now() - 1000 * 60 * 60 * (6 + i * 3)).toISOString(),
      read: false,
    });
  });
  return out.sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 24);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DutyNotif[]>(() => load(STORAGE_KEY, [] as DutyNotif[]));
  const [prefs, setPrefsState] = useState<EmailPrefs>(() =>
    load(PREFS_KEY, { frequency: "weekly", recipients: ["operations@refuelpm.com"] } as EmailPrefs),
  );

  useEffect(() => {
    const snap = load<Record<string, DutyLevel>>(SNAPSHOT_KEY, {});
    const current: Record<string, DutyLevel> = {};
    const fresh: DutyNotif[] = [];
    const first = Object.keys(snap).length === 0;
    goalkeepers.forEach((gk) => {
      const lvl = dutyStatusForGk(gk).level;
      current[gk.id] = lvl;
      const prev = snap[gk.id];
      if (prev && prev !== lvl) {
        fresh.push({
          id: `${gk.id}-${Date.now()}-${lvl}`,
          gkId: gk.id,
          gkName: gk.name,
          from: prev,
          to: lvl,
          date: new Date().toISOString(),
          read: false,
        });
      }
    });
    persist(SNAPSHOT_KEY, current);

    if (first && items.length === 0) {
      const seeded = seedFromCurrent();
      setItems(seeded);
      persist(STORAGE_KEY, seeded);
    } else if (fresh.length) {
      fresh.forEach((n) => {
        const verb = rank(n.to) > rank(n.from) ? "escalated" : "improved";
        const fn =
          n.to === "overdue" ? toast.error : n.to === "due_soon" ? toast.warning : toast.success;
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
  }, []);

  const setPrefs = (p: EmailPrefs) => {
    setPrefsState(p);
    persist(PREFS_KEY, p);
  };
  const markAllRead = () =>
    setItems((p) => {
      const n = p.map((x) => ({ ...x, read: true }));
      persist(STORAGE_KEY, n);
      return n;
    });
  const markRead = (id: string) =>
    setItems((p) => {
      const n = p.map((x) => (x.id === id ? { ...x, read: true } : x));
      persist(STORAGE_KEY, n);
      return n;
    });
  const clearAll = () => {
    setItems([]);
    persist(STORAGE_KEY, []);
  };

  const sendSummaryNow = () => {
    const attn = items.filter((i) => i.to === "overdue" || i.to === "due_soon").length;
    const recipients = prefs.recipients.filter(Boolean);
    if (!recipients.length) {
      toast.error("Add at least one recipient first");
      return;
    }
    const next = { ...prefs, lastSent: new Date().toISOString() };
    setPrefs(next);
    toast.success("Duty-of-care summary queued", {
      description: `${attn} needing attention · delivered to ${recipients.join(", ")}`,
    });
  };

  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);

  return (
    <C.Provider
      value={{ items, unread, markAllRead, markRead, clearAll, prefs, setPrefs, sendSummaryNow }}
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
