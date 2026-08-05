import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type Role = "super_admin" | "admin" | "mentor_manager" | "mentor";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  actualRole?: Role;
  initials: string;
  title: string;
  mentorId?: string;
}

const VIEW_AS_KEY = "rpm.viewAsRole";
function readViewAs(): Role | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(VIEW_AS_KEY);
    return v === "super_admin" || v === "admin" || v === "mentor_manager" || v === "mentor" ? v : null;
  } catch { return null; }
}


// Reference directory of known team members (for name/initials lookups in the UI only).
// Login and role assignment go through Supabase Auth + the user_roles table — not this list.
export const DEMO_USERS: SessionUser[] = [
  { id: "u-luke", name: "Luke Corrigan", email: "lcorrigan@gkhq.app", role: "super_admin", initials: "LC", title: "System Admin / Product Owner" },
  { id: "u-rich", name: "Rich Lee", email: "rlee@gkhq.app", role: "admin", initials: "RL", title: "Co-Founder & Director", mentorId: "m-rich-lee" },
  { id: "u-drouse", name: "David Rouse", email: "drouse@gkhq.app", role: "mentor_manager", initials: "DR", title: "Managing Director & Mentor", mentorId: "m-david-rouse" },
  { id: "u-dwatson", name: "Dave Watson", email: "dwatson@gkhq.app", role: "mentor", initials: "DW", title: "Goalkeeper Mentor", mentorId: "m-dave-watson" },
  { id: "u-amarshall", name: "Andy Marshall", email: "amarshall@gkhq.app", role: "mentor", initials: "AM", title: "Goalkeeper Mentor", mentorId: "m-andy-marshall" },
  { id: "u-jstern", name: "Jack Stern", email: "jstern@gkhq.app", role: "mentor", initials: "JS", title: "Goalkeeper Mentor", mentorId: "m-jack-stern" },
  { id: "u-achamberlain", name: "Alec Chamberlain", email: "achamberlain@gkhq.app", role: "mentor", initials: "AC", title: "Goalkeeper Mentor", mentorId: "m-alec-chamberlain" },
  { id: "u-mmargetson", name: "Martyn Margetson", email: "mmargetson@gkhq.app", role: "mentor", initials: "MM", title: "Goalkeeper Mentor", mentorId: "m-martyn-margetson" },
  { id: "u-mmiddelbeek", name: "Martijn Middelbeek", email: "mmiddelbeek@gkhq.app", role: "mentor", initials: "MM", title: "Goalkeeper Mentor", mentorId: "m-martijn-middelbeek" },
  { id: "u-mbeadle", name: "Matt Beadle", email: "mbeadle@gkhq.app", role: "mentor", initials: "MB", title: "Goalkeeper Mentor", mentorId: "m-matt-beadle" },
];

export type Permission =
  | "system.manage"
  | "goalkeepers.view"
  | "goalkeepers.edit"
  | "goalkeepers.create"
  /**
   * Correct the club stored on a canonical player record. Mirrors the
   * `players_update_club_authorised` RLS policy and `CLUB_EDIT_ROLES` — this
   * only decides what the UI offers; the database decides what is allowed.
   */
  | "players.edit_club"
  | "mentors.view"
  | "interactions.view"
  | "interactions.log"
  /** Correct an interaction someone else logged. */
  | "interactions.manage"
  | "reports.view"
  | "reports.submit"
  | "reports.manage"
  | "media.view"
  | "media.upload"
  | "media.edit"
  
  | "alerts.view"
  | "calendar.view"
  | "executive.view"
  | "audit.view";

const MENTOR: Permission[] = [
  "goalkeepers.view",
  "mentors.view",
  "interactions.view", "interactions.log",
  "reports.view", "reports.submit",
  "media.view", "media.upload", "media.edit",
  "calendar.view",
];

const MENTOR_MANAGER: Permission[] = [
  ...MENTOR,
  "goalkeepers.edit", "goalkeepers.create",
  "players.edit_club",
  "mentors.view",
  "interactions.manage",
  "reports.manage",
  "audit.view",
];

const ADMIN: Permission[] = [
  "goalkeepers.view", "goalkeepers.edit", "goalkeepers.create",
  "players.edit_club",
  "mentors.view",
  "interactions.view", "interactions.log", "interactions.manage",
  "reports.view", "reports.submit", "reports.manage",
  "media.view", "media.edit",
  "alerts.view", "calendar.view",
  "executive.view", "audit.view",
];

const SUPER_ADMIN: Permission[] = [
  "system.manage",
  ...ADMIN,
  "interactions.log", "reports.submit", "media.upload",
];

const MATRIX: Record<Role, Permission[]> = {
  super_admin: SUPER_ADMIN,
  admin: ADMIN,
  mentor_manager: MENTOR_MANAGER,
  mentor: MENTOR,
};

/** One canonical client-side permission check for role-gated UI. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  can: (p: Permission) => boolean;
  setViewAsRole: (role: Role | null) => void;
}


const Ctx = createContext<AuthState | null>(null);

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  initials: string;
  title: string;
  mentor_id: string | null;
}

async function loadSessionUser(session: Session | null): Promise<SessionUser | null> {
  if (!session?.user) return null;
  const uid = session.user.id;

  // Role is fetched from the database, not client state. The user_roles RLS
  // policy restricts each row to its owner (auth.uid() = user_id).
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("profiles").select("id,email,name,initials,title,mentor_id").eq("id", uid).maybeSingle<ProfileRow>(),
  ]);

  const roleValues = (roles ?? []).map((r) => r.role as Role);
  const role: Role =
    roleValues.includes("super_admin") ? "super_admin" :
    roleValues.includes("admin") ? "admin" :
    roleValues.includes("mentor_manager") ? "mentor_manager" :
    "mentor";

  const email = profile?.email ?? session.user.email ?? "";
  const fallbackName = email.split("@")[0] ?? "User";
  const name = profile?.name || fallbackName;
  const initials = profile?.initials || name.slice(0, 2).toUpperCase();

  const actualRole = role;
  const override = readViewAs();
  const effectiveRole: Role = actualRole === "super_admin" && override ? override : actualRole;

  return {
    id: uid,
    email,
    name,
    initials,
    title: profile?.title ?? "",
    role: effectiveRole,
    actualRole,
    mentorId: profile?.mentor_id ?? undefined,
  };
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Subscribe first, then hydrate — avoids missed events.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      // Defer async work to avoid deadlocking the auth callback.
      setTimeout(() => {
        if (cancelled) return;
        loadSessionUser(session).then((u) => { if (!cancelled) setUser(u); });
      }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      loadSessionUser(data.session).then((u) => {
        if (cancelled) return;
        setUser(u);
        setLoading(false);
      });
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const signIn: AuthState["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  // Public sign-up is disabled during the pilot (Phase 1.1). Accounts are
  // provisioned by an admin. The server-side auth signup endpoint remains
  // reachable until Phase 5.7 disables it in Supabase Auth config.


  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const can = (p: Permission) => !!user && roleHasPermission(user.role, p);

  const setViewAsRole: AuthState["setViewAsRole"] = (role) => {
    if (typeof window === "undefined") return;
    try {
      if (role) window.localStorage.setItem(VIEW_AS_KEY, role);
      else window.localStorage.removeItem(VIEW_AS_KEY);
    } catch { /* ignore */ }
    setUser((u) => {
      if (!u || !u.actualRole) return u;
      const next: Role = u.actualRole === "super_admin" && role ? role : u.actualRole;
      return { ...u, role: next };
    });
  };

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut, can, setViewAsRole }}>
      {children}
    </Ctx.Provider>
  );
}



export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  mentor_manager: "Mentor Manager",
  mentor: "Mentor",
};
