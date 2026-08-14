import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Check, X, Download, ShieldCheck, Eye } from "lucide-react";
import { PageHeader, Card } from "@/components/primitives";
import { useAuth, ROLE_LABEL, type Permission, type Role } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/system/permissions")({ component: PermissionsReportPage });

type Group = { title: string; items: { perm: Permission; label: string; description: string }[] };

const GROUPS: Group[] = [
  {
    title: "Goalkeepers",
    items: [
      {
        perm: "goalkeepers.view",
        label: "View goalkeepers",
        description: "See goalkeeper profiles and directory.",
      },
      {
        perm: "goalkeepers.create",
        label: "Create goalkeepers",
        description: "Add new goalkeeper records.",
      },
      {
        perm: "goalkeepers.edit",
        label: "Edit goalkeepers",
        description: "Update goalkeeper details and status.",
      },
    ],
  },
  {
    title: "Users & roles",
    items: [
      {
        perm: "mentors.view",
        label: "View users and roles",
        description: "Browse the read-only user directory and activity totals.",
      },
    ],
  },
  {
    title: "Interactions",
    items: [
      {
        perm: "interactions.view",
        label: "View interactions",
        description: "Read the interactions log.",
      },
      {
        perm: "interactions.log",
        label: "Log interactions",
        description: "Record calls, meetings, and notes.",
      },
    ],
  },
  {
    title: "Match reports",
    items: [
      {
        perm: "reports.view",
        label: "View reports",
        description: "Open the reports list and detail pages.",
      },
      {
        perm: "reports.submit",
        label: "Submit reports",
        description: "Create and file new match reports.",
      },
      {
        perm: "reports.manage",
        label: "Manage reports",
        description: "Edit or moderate reports across coaches.",
      },
    ],
  },
  {
    title: "Media",
    items: [
      { perm: "media.view", label: "View media", description: "Browse the shared media library." },
      {
        perm: "media.upload",
        label: "Upload media",
        description: "Add clips, images, PDFs, and voice notes.",
      },
      {
        perm: "media.edit",
        label: "Edit media",
        description: "Rename, tag, and remove media items.",
      },
    ],
  },
  {
    title: "Alerts & calendar",
    items: [
      { perm: "alerts.view", label: "View alerts", description: "Read the notification centre." },
      {
        perm: "calendar.view",
        label: "View calendar",
        description: "See scheduled sessions and events.",
      },
    ],
  },
  {
    title: "Oversight",
    items: [
      {
        perm: "executive.view",
        label: "Executive view",
        description: "Access executive dashboards and KPIs.",
      },
      { perm: "audit.view", label: "View audit log", description: "Inspect the audit history." },
      {
        perm: "system.manage",
        label: "System management",
        description: "Manage users, roles, and system settings.",
      },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));

function PermissionsReportPage() {
  const { user, can } = useAuth();

  const rows = useMemo(
    () => ALL_ITEMS.map((i) => ({ ...i, allowed: !!user && can(i.perm) })),
    [user, can],
  );

  const allowed = rows.filter((r) => r.allowed).length;
  const denied = rows.length - allowed;

  const effectiveRole: Role | null = user?.role ?? null;
  const actualRole: Role | null = user?.actualRole ?? null;
  const impersonating = !!actualRole && !!effectiveRole && actualRole !== effectiveRole;

  const downloadJson = () => {
    const payload = {
      generated_at: new Date().toISOString(),
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
      actual_role: actualRole,
      effective_role: effectiveRole,
      counts: { allowed, denied, total: rows.length },
      permissions: rows.map(({ perm, label, group, allowed }) => ({
        permission: perm,
        label,
        group,
        allowed,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerDownload(blob, `permissions-${effectiveRole ?? "unknown"}.json`);
  };

  const downloadCsv = () => {
    const header = ["group", "permission", "label", "allowed"];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [r.group, r.perm, r.label, r.allowed ? "yes" : "no"]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    triggerDownload(blob, `permissions-${effectiveRole ?? "unknown"}.csv`);
  };

  if (!user) {
    return (
      <div className="max-w-2xl">
        <PageHeader
          title="Permission check"
          description="Sign in to view your permission report."
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Permission check"
        description="What your current role can and can't do in this app."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCsv}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent"
            >
              <Download className="size-4" /> CSV
            </button>
            <button
              onClick={downloadJson}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Download className="size-4" /> JSON
            </button>
          </div>
        }
      />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-muted-foreground">Effective role:</span>
            <span className="font-medium">{effectiveRole ? ROLE_LABEL[effectiveRole] : "—"}</span>
          </div>
          {impersonating && (
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-warning" />
              <span className="text-muted-foreground">Viewing as, actual role:</span>
              <span className="font-medium">{ROLE_LABEL[actualRole!]}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5 text-success" /> {allowed} allowed
            </span>
            <span className="inline-flex items-center gap-1">
              <X className="size-3.5 text-destructive" /> {denied} denied
            </span>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {GROUPS.map((g) => {
          const groupRows = rows.filter((r) => r.group === g.title);
          const groupAllowed = groupRows.filter((r) => r.allowed).length;
          return (
            <Card key={g.title} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-sm font-semibold">{g.title}</h2>
                <span className="text-xs text-muted-foreground tabular-nums font-mono">
                  {groupAllowed}/{groupRows.length} allowed
                </span>
              </div>
              <ul className="divide-y divide-border">
                {groupRows.map((r) => (
                  <li key={r.perm} className="flex items-start gap-3 px-4 py-2.5">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-5 items-center justify-center rounded-full",
                        r.allowed
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive",
                      )}
                      aria-label={r.allowed ? "Allowed" : "Denied"}
                    >
                      {r.allowed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{r.label}</span>
                        <code className="text-[10px] text-muted-foreground">{r.perm}</code>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
