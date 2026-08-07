import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, ShieldOff, Users, Search, Loader2, AlertCircle, UserPlus, Trash2, Copy, Pencil, KeyRound, Mail } from "lucide-react";
import { useAuth, ROLE_LABEL, type Role } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CANONICAL_ORIGIN } from "@/lib/canonical-url";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listManagedUsers,
  setManagedUserRole,
  createManagedUser,
  deleteManagedUser,
  resetManagedUserPassword,
  inviteManagedUser,
  type ManagedUserRow,
} from "@/lib/admin-users.functions";
import { refreshUserDirectoryViews } from "@/lib/query-refresh";


export const Route = createFileRoute("/system/users")({ component: SystemUsersPage });

const ROLES: Role[] = ["super_admin", "admin", "mentor_manager", "mentor"];
type RoleOrNone = Role | "";

const ROLE_TONE: Record<Role, string> = {
  super_admin: "bg-primary/15 text-primary border-primary/30",
  admin: "bg-accent text-accent-foreground border-border",
  mentor_manager: "bg-warning/15 text-warning border-warning/30",
  mentor: "bg-success/15 text-success border-success/30",
};

const QUERY_KEY = ["managed-users"] as const;

function SystemUsersPage() {
  const { user, can } = useAuth();
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUserRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ManagedUserRow | null>(null);
  const [confirmReset, setConfirmReset] = useState<ManagedUserRow | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<{ email: string; url: string } | null>(null);

  const list = useServerFn(listManagedUsers);
  const setRole = useServerFn(setManagedUserRole);
  const createUser = useServerFn(createManagedUser);
  const deleteUser = useServerFn(deleteManagedUser);
  const resetPassword = useServerFn(resetManagedUserPassword);
  const inviteUser = useServerFn(inviteManagedUser);
  const qc = useQueryClient();
  const router = useRouter();


  const canManage = !!user && can("system.manage");

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => list(),
    enabled: canManage,
  });

  const mutation = useMutation({
    mutationFn: (vars: { userId: string; role: Role | null; name: string }) =>
      setRole({ data: { userId: vars.userId, role: vars.role } }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setEditUser(null);
      toast.success(
        vars.role ? `${vars.name} → ${ROLE_LABEL[vars.role]}` : `${vars.name}: role revoked`,
      );
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    },
  });

  const createMutation = useMutation({
    mutationFn: (vars: { email: string; name: string; title: string; role: Role | null }) =>
      createUser({ data: vars }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setShowAdd(false);
      toast.success(`Added ${vars.name}`);
      if (res?.tempPassword) setTempPassword({ email: vars.email, password: res.tempPassword });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (u: ManagedUserRow) => deleteUser({ data: { userId: u.id } }),
    onSuccess: async (_r, u) => {
      // A deleted account changes counts and names everywhere — refresh the
      // directory, every dashboard KPI, the interactions log and the calendar,
      // then re-run route loaders so nothing on screen keeps the stale row.
      await refreshUserDirectoryViews(qc);
      await router.invalidate();
      setConfirmDelete(null);
      toast.success(`Deleted ${u.name || u.email}`);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    },
  });


  const resetMutation = useMutation({
    mutationFn: (u: ManagedUserRow) => resetPassword({ data: { userId: u.id } }),
    onSuccess: (res, u) => {
      setConfirmReset(null);
      setTempPassword({ email: u.email || res.email, password: res.tempPassword });
      toast.success(`Password reset for ${u.name || u.email}`);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (vars: { email: string; name: string; title: string; role: Role | null }) => {
      return inviteUser({ data: { ...vars, redirectTo: `${CANONICAL_ORIGIN}/reset-password` } });
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setShowInvite(false);
      toast.success(`Invited ${vars.name}`);
      if (res?.inviteLink) setInviteLink({ email: vars.email, url: res.inviteLink });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to invite user");
    },
  });

  if (!canManage) {
    return (
      <div className="max-w-lg mx-auto mt-16 rounded-lg border border-border bg-card p-6 text-center">
        <ShieldOff className="size-8 mx-auto text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Restricted</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only Super Admins can manage users and roles.
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const users = query.data ?? [];
  const filtered = users.filter(
    (u) =>
      !q.trim() ||
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase()),
  );

  const changeRole = (u: ManagedUserRow, next: Role | null) => {
    if (next === u.role) {
      setEditUser(null);
      return;
    }
    mutation.mutate({ userId: u.id, role: next, name: u.name || u.email });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-[10px] uppercase tracking-wider font-medium text-primary">
              System · Super Admin
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Users &amp; Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add, remove, and assign roles. Changes take effect on the user's next sign-in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex h-9 px-3 items-center gap-2 rounded-md border border-border text-sm font-medium hover:bg-accent"
          >
            <Mail className="size-4" /> Invite user
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex h-9 px-3 items-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <UserPlus className="size-4" /> Add user
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="w-full h-9 pl-9 pr-3 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="hidden md:grid grid-cols-[1fr_160px_240px] gap-3 px-4 py-2.5 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/30">
          <div>User</div>
          <div>Current role</div>
          <div className="text-right">Actions</div>
        </div>

        {query.isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading users…
          </div>
        ) : query.isError ? (
          <div className="px-4 py-10 text-center text-sm">
            <AlertCircle className="size-6 mx-auto mb-2 text-destructive" />
            <div className="text-destructive">
              {query.error instanceof Error ? query.error.message : "Failed to load users"}
            </div>
            <button
              onClick={() => query.refetch()}
              className="mt-3 inline-flex h-8 px-3 items-center rounded-md border border-border text-xs font-medium hover:bg-accent"
            >
              Retry
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((u) => {
              const isSelf = u.id === user!.id;
              const busy = mutation.isPending && mutation.variables?.userId === u.id;
              return (
                <li
                  key={u.id}
                  className="grid md:grid-cols-[1fr_160px_240px] gap-3 px-4 py-3 items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-full bg-accent grid place-items-center text-xs font-semibold shrink-0">
                      {u.initials || (u.name || u.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        {u.name || u.email}
                        {isSelf && (
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {u.email}
                        {u.title ? ` · ${u.title}` : ""}
                      </div>
                    </div>
                  </div>
                  <div>
                    {u.role ? (
                      <span
                        className={cn(
                          "inline-flex h-6 px-2 items-center rounded border text-[10px] uppercase tracking-wider font-medium",
                          ROLE_TONE[u.role],
                        )}
                      >
                        {ROLE_LABEL[u.role]}
                      </span>
                    ) : (
                      <span className="inline-flex h-6 px-2 items-center rounded border border-dashed border-border text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                        No role
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditUser(u)}
                      disabled={isSelf || busy}
                      title={isSelf ? "You can't change your own role from this screen" : "Edit roles"}
                      className="inline-flex h-8 px-2.5 items-center gap-1.5 rounded-md border border-border text-xs font-medium hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
                      Edit roles
                    </button>
                    <button
                      onClick={() => setConfirmReset(u)}
                      disabled={isSelf || (resetMutation.isPending && resetMutation.variables?.id === u.id)}
                      title={isSelf ? "You can't reset your own password from this screen" : "Reset password"}
                      className="size-8 grid place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {resetMutation.isPending && resetMutation.variables?.id === u.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(u)}
                      disabled={isSelf}
                      title={isSelf ? "You can't delete your own account" : "Delete user"}
                      className="size-8 grid place-items-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Users className="size-6 mx-auto mb-2 opacity-50" />
                {users.length === 0
                  ? "No users yet. Click Add user to invite one."
                  : `No users match "${q}".`}
              </li>
            )}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddUserDialog
          busy={createMutation.isPending}
          onCancel={() => setShowAdd(false)}
          onSubmit={(vals) => createMutation.mutate(vals)}
        />
      )}

      {showInvite && (
        <InviteUserDialog
          busy={inviteMutation.isPending}
          onCancel={() => setShowInvite(false)}
          onSubmit={(vals) => inviteMutation.mutate(vals)}
        />
      )}

      {inviteLink && (
        <InviteLinkDialog
          email={inviteLink.email}
          url={inviteLink.url}
          onClose={() => setInviteLink(null)}
        />
      )}

      {editUser && (
        <EditRoleDialog
          user={editUser}
          busy={mutation.isPending}
          onCancel={() => setEditUser(null)}
          onSubmit={(role) => changeRole(editUser, role)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name || confirmDelete.email}?`}
          message="This permanently removes the account, profile, and role. This cannot be undone."
          confirmLabel="Delete user"
          destructive
          busy={deleteMutation.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMutation.mutate(confirmDelete)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title={`Reset password for ${confirmReset.name || confirmReset.email}?`}
          message="A new temporary password will be generated. The user's current password will stop working immediately. You'll be shown the new password once — copy it now, it can't be retrieved later."
          confirmLabel="Generate new password"
          busy={resetMutation.isPending}
          onCancel={() => setConfirmReset(null)}
          onConfirm={() => resetMutation.mutate(confirmReset)}
        />
      )}

      {tempPassword && (
        <TempPasswordDialog
          email={tempPassword.email}
          password={tempPassword.password}
          onClose={() => setTempPassword(null)}
        />
      )}
    </div>
  );
}

function AddUserDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { email: string; name: string; title: string; role: Role | null }) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<RoleOrNone>("mentor");

  const valid = email.includes("@") && name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-base font-semibold">Add user</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Creates a signed-in account with an auto-generated temporary password.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Full name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="jane@gkhq.app"
            />
          </Field>
          <Field label="Title (optional)">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Goalkeeper Mentor"
            />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleOrNone)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">— No role —</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                email: email.trim(),
                name: name.trim(),
                title: title.trim(),
                role: role === "" ? null : role,
              })
            }
            disabled={!valid || busy}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Create user
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "h-9 px-3 rounded-md text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50",
              destructive
                ? "bg-destructive text-destructive-foreground hover:opacity-90"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TempPasswordDialog({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-base font-semibold">Temporary password</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Share these credentials with {email} securely. They won't be shown again.
        </p>
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 font-mono text-sm break-all">
          {password}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={copy}
            className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-accent inline-flex items-center gap-2"
          >
            <Copy className="size-4" /> Copy
          </button>
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRoleDialog({
  user,
  busy,
  onCancel,
  onSubmit,
}: {
  user: ManagedUserRow;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (role: Role | null) => void;
}) {
  const [role, setRole] = useState<RoleOrNone>(user.role ?? "");
  const changed = (role === "" ? null : role) !== user.role;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-base font-semibold">Edit roles</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {user.name || user.email}
          {user.email && user.name ? ` · ${user.email}` : ""}
        </p>

        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Current role
          </div>
          {user.role ? (
            <span
              className={cn(
                "inline-flex h-6 px-2 items-center rounded border text-[10px] uppercase tracking-wider font-medium",
                ROLE_TONE[user.role],
              )}
            >
              {ROLE_LABEL[user.role]}
            </span>
          ) : (
            <span className="inline-flex h-6 px-2 items-center rounded border border-dashed border-border text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              No role
            </span>
          )}
        </div>

        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Assign role
          </div>
          <div className="space-y-1.5">
            {(["", ...ROLES] as RoleOrNone[]).map((r) => {
              const id = `role-${r || "none"}`;
              const label = r === "" ? "No role (revoke access)" : ROLE_LABEL[r];
              const selected = role === r;
              return (
                <label
                  key={id}
                  htmlFor={id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer text-sm",
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name="edit-role"
                    value={r}
                    checked={selected}
                    onChange={() => setRole(r)}
                    className="accent-primary"
                  />
                  <span className="font-medium">{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(role === "" ? null : role)}
            disabled={busy || !changed}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteUserDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { email: string; name: string; title: string; role: Role | null }) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<RoleOrNone>("admin");

  const valid = email.includes("@") && name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-base font-semibold">Invite user</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Creates the account and generates a one-time sign-up link. The user sets their own password when they open the link.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Full name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Rich Lee"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="rich@example.com"
            />
          </Field>
          <Field label="Title (optional)">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Head of Recruitment"
            />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleOrNone)}
              className="w-full h-9 px-2 rounded-md border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">— No role —</option>
              {(["super_admin", "admin", "mentor_manager", "mentor"] as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                email: email.trim(),
                name: name.trim(),
                title: title.trim(),
                role: role === "" ? null : role,
              })
            }
            disabled={!valid || busy}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Generate invite link
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteLinkDialog({
  email,
  url,
  onClose,
}: {
  email: string;
  url: string;
  onClose: () => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-base font-semibold">One-time sign-up link</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Send this link to <span className="font-medium text-foreground">{email}</span>. Opening it signs them in once and prompts them to set a password. The link can only be used once and won't be shown again.
        </p>
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 font-mono text-xs break-all">
          {url}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={copy}
            className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-accent inline-flex items-center gap-2"
          >
            <Copy className="size-4" /> Copy link
          </button>
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
