import { DEMO_USERS, type Role, type SessionUser } from "./auth";

export interface ManagedUser extends SessionUser {
  active: boolean;
}

const KEY = "rpm.users.v2";
type Listener = () => void;

function seed(): ManagedUser[] {
  return DEMO_USERS.map((u) => ({ ...u, active: true }));
}

function load(): ManagedUser[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as ManagedUser[];
    // Merge with seed so newly-added demo users still appear.
    const bySeed = seed();
    const byId = new Map(parsed.map((u) => [u.id, u]));
    return bySeed
      .map((s) => byId.get(s.id) ?? s)
      .concat(parsed.filter((u) => !bySeed.find((s) => s.id === u.id)));
  } catch {
    return seed();
  }
}

let state: ManagedUser[] = load();
const listeners = new Set<Listener>();

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

export const usersStore = {
  list(): ManagedUser[] {
    return state;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setRole(id: string, role: Role) {
    state = state.map((u) => (u.id === id ? { ...u, role } : u));
    persist();
  },
  setActive(id: string, active: boolean) {
    state = state.map((u) => (u.id === id ? { ...u, active } : u));
    persist();
  },
  reset() {
    state = seed();
    persist();
  },
};
