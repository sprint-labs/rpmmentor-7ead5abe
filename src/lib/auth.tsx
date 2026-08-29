import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { hasAuthCallback, isRecoveryCallback } from "@/lib/password-recovery";

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
// Each `role` here mirrors the provisioned production role so this list can never
// imply a permission the database does not grant. The addresses are deliberately
// placeholders: real contact addresses belong in Supabase, not in the repository.
export const DEMO_USERS: SessionUser[] = [
  { id: "u-luke", name: "Luke Corrigan", email: "lcorrigan@gkhq.app", role: "super_admin", initials: "LC", title: "System Admin / Product Owner" },
  { id: "u-rich", name: "Rich Lee", email: "rlee@gkhq.app", role: "mentor_manager", initials: "RL", title: "Co-Founder & Director", mentorId: "m-rich-lee" },
  { id: "u-drouse", name: "David Rouse", email: "drouse@gkhq.app", role: "mentor_manager", initials: "DR", title: "Managing Director & Mentor", mentorId: "m-david-rouse" },
  { id: "u-mbeadle", name: "Matt Beadle", email: "mbeadle@gkhq.app", role: "mentor_manager", initials: "MB", title: "Mentor Manager", mentorId: "m-matt-beadle" },
  { id: "u-dwatson", name: "Dave Watson", email: "dwatson@gkhq.app", role: "mentor", initials: "DW", title: "Goalkeeper Mentor", mentorId: "m-dave-watson" },
  { id: "u-amarshall", name: "Andy Marshall", email: "amarshall@gkhq.app", role: "mentor", initials: "AM", title: "Goalkeeper Mentor", mentorId: "m-andy-marshall" },
  { id: "u-achamberlain", name: "Alec Chamberlain", email: "achamberlain@gkhq.app", role: "mentor", initials: "AC", title: "Goalkeeper Mentor", mentorId: "m-alec-chamberlain" },
  { id: "u-mmargetson", name: "Martyn Margetson", email: "mmargetson@gkhq.app", role: "mentor", initials: "MM", title: "Goalkeeper Mentor", mentorId: "m-martyn-margetson" },
  { id: "u-mmiddelbeek", name: "Martijn Middelbeek", email: "mmiddelbeek@gkhq.app", role: "mentor", initials: "MM", title: "Goalkeeper Mentor", mentorId: "m-martijn-middelbeek" },
  { id: "u-gward", name: "Gavin Ward", email: "gward@gkhq.app", role: "mentor", initials: "GW", title: "Goalkeeper Mentor" },
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
  /** Edit or safely delete any canonical player record. */
  | "players.manage"
  | "mentors.view"
  | "interactions.view"
  | "interactions.log"
  /** Correct an interaction someone else logged. */
  | "interactions.manage"
  /** Safely delete an interaction. */
  | "interactions.delete"
  | "reports.view"
  | "reports.submit"
  | "reports.manage"
  | "media.view"
  | "media.upload"
  | "media.edit"
  
  | "alerts.view"
  | "calendar.view"
  /** Add, edit or remove shared team calendar events. */
  | "calendar.manage"
  | "executive.view"
  | "audit.view"
  /** Open a bug report or question and reply on own threads. */
  | "support.send"
  /** Super Admin support inbox and broadcast controls. */
  | "support.inbox";

const MENTOR: Permission[] = [
  "goalkeepers.view",
  "mentors.view",
  "interactions.view", "interactions.log",
  "reports.view", "reports.submit",
  "media.view", "media.upload", "media.edit",
  "calendar.view",
  "support.send",
];

const MENTOR_MANAGER: Permission[] = [
  ...MENTOR,
  "goalkeepers.edit", "goalkeepers.create",
  "players.edit_club",
  "mentors.view",
  "interactions.manage",
  "reports.manage",
  "calendar.manage",
  "audit.view",
];

/**
 * Admin is the oversight role: it sees everything a Mentor Manager sees, plus
 * the Executive dashboard, but it does not record mentoring work of its own.
 * `interactions.log` and `reports.submit` are deliberately absent — an admin
 * still corrects other people's entries through `interactions.manage` and
 * `reports.manage`. Mirrors `INTERACTION_LOG_ROLES` and `REPORT_SUBMIT_ROLES`.
 */
const ADMIN: Permission[] = [
  "goalkeepers.view", "goalkeepers.edit", "goalkeepers.create",
  "players.edit_club",
  "mentors.view",
  "interactions.view", "interactions.manage",
  "reports.view", "reports.manage",
  "media.view", "media.edit",
  "calendar.view", "calendar.manage",
  "executive.view", "audit.view",
  "support.send",
];

const SUPER_ADMIN: Permission[] = [
  "system.manage",
  ...ADMIN,
  "alerts.view",
  "players.manage", "interactions.delete",
  "interactions.log", "reports.submit", "media.upload",
  "support.inbox",
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
  /** True while the caller must finish the email recovery flow on /reset-password. */
  passwordRecoveryPending: boolean;
  clearPasswordRecoveryPending: () => void;
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

/**
 * Resolve the effective stored role without ever inventing access.
 *
 * A signed-in Auth account may legitimately have no `user_roles` row while it
 * is awaiting provisioning (or after access is revoked). That state must stay
 * roleless rather than silently inheriting Mentor permissions in the UI.
 */
export function resolveActualRole(roleValues: readonly string[]): Role | null {
  if (roleValues.includes("super_admin")) return "super_admin";
  if (roleValues.includes("admin")) return "admin";
  if (roleValues.includes("mentor_manager")) return "mentor_manager";
  if (roleValues.includes("mentor")) return "mentor";
  return null;
}

async function loadSessionUser(session: Session | null): Promise<SessionUser | null> {
  if (!session?.user) return null;
  const uid = session.user.id;

  // Role is fetched from the database, not client state. The user_roles RLS
  // policy restricts each row to its owner (auth.uid() = user_id).
  const [rolesResult, profileResult] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("profiles").select("id,email,name,initials,title,mentor_id").eq("id", uid).maybeSingle<ProfileRow>(),
  ]);
  if (rolesResult.error || profileResult.error) {
    throw new Error("Unable to verify account access.");
  }

  const roleValues = (rolesResult.data ?? []).map((r) => r.role as string);
  const actualRole = resolveActualRole(roleValues);
  if (!actualRole) return null;

  const profile = profileResult.data;
  const email = profile?.email ?? session.user.email ?? "";
  const fallbackName = email.split("@")[0] ?? "User";
  const name = profile?.name || fallbackName;
  const initials = profile?.initials || name.slice(0, 2).toUpperCase();

  const override = readViewAs();
  // Super admins may preview any role. Mentor managers may preview the mentor
  // interface so they can walk mentors through "what the lads see".
  const effectiveRole: Role =
    actualRole === "super_admin" && override ? override :
    actualRole === "mentor_manager" && override === "mentor" ? "mentor" :
    actualRole;

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

async function clearLocalAuthSession() {
  try {
    // Local scope clears the browser-held token without depending on a network
    // round trip. Database RLS remains the independent server-side boundary.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The UI still fails closed below if storage itself is unavailable.
  }
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(() => {
    if (typeof window === "undefined") return false;
    return isRecoveryCallback(window.location) || hasAuthCallback(window.location);
  });

  useEffect(() => {
    let cancelled = false;

    const applySession = async (session: Session | null, finishLoading = false) => {
      try {
        const nextUser = await loadSessionUser(session);
        if (session?.user && !nextUser) {
          // An Auth identity without an operational role is not an application
          // user. Clear its session so OAuth and restored sessions fail closed.
          await clearLocalAuthSession();
        }
        if (!cancelled) setUser(nextUser);
      } catch {
        // A failed role lookup must never leave either a default Mentor UI or a
        // browser-held JWT behind.
        if (session?.user) await clearLocalAuthSession();
        if (!cancelled) setUser(null);
      } finally {
        if (finishLoading && !cancelled) setLoading(false);
      }
    };

    // Subscribe first, then hydrate — avoids missed events.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryPending(true);
      } else if (event === "SIGNED_OUT") {
        setPasswordRecoveryPending(false);
      }

      // Defer async work to avoid deadlocking the auth callback.
      setTimeout(() => {
        if (cancelled) return;
        void applySession(session);
      }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session, true);
    }).catch(() => {
      if (cancelled) return;
      setUser(null);
      setLoading(false);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const clearPasswordRecoveryPending = () => setPasswordRecoveryPending(false);

  const signIn: AuthState["signIn"] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    try {
      const nextUser = await loadSessionUser(data.session);
      if (!nextUser) {
        await clearLocalAuthSession();
        setUser(null);
        return {
          ok: false,
          error: "Your account has not been granted access to Mentor Hub.",
        };
      }
      setUser(nextUser);
      return { ok: true };
    } catch {
      await clearLocalAuthSession();
      setUser(null);
      return { ok: false, error: "Unable to verify your access. Please try again." };
    }
  };

  // Public sign-up is disabled during the pilot (Phase 1.1). Accounts are
  // provisioned by an admin. The server-side auth signup endpoint remains
  // reachable until Phase 5.7 disables it in Supabase Auth config.


  const signOut = async () => {
    await supabase.auth.signOut();
    setPasswordRecoveryPending(false);
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
      let next: Role = u.actualRole;
      if (u.actualRole === "super_admin" && role) next = role;
      else if (u.actualRole === "mentor_manager" && role === "mentor") next = "mentor";
      return { ...u, role: next };
    });
  };

  return (
    <Ctx.Provider value={{ user, loading, passwordRecoveryPending, clearPasswordRecoveryPending, signIn, signOut, can, setViewAsRole }}>
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
