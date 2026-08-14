import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Card, Pill } from "@/components/primitives";
import { DataSourceBanner } from "@/lib/data-classification";
import { getGk, formatDate } from "@/lib/mock-data";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listAuditLog, type MediaAuditEntry } from "@/lib/media-store";
import { Upload, Eye, Pencil, Trash2, FileWarning } from "lucide-react";

export const Route = createFileRoute("/audit")({ component: AuditPage });

const ACTIONS = ["all", "upload", "open", "edit", "delete"] as const;
const ACTION_META: Record<
  string,
  {
    tone: "success" | "info" | "warning" | "destructive" | "muted";
    icon: typeof Upload;
    label: string;
  }
> = {
  upload: { tone: "success", icon: Upload, label: "Upload" },
  open: { tone: "info", icon: Eye, label: "Open / Download" },
  edit: { tone: "warning", icon: Pencil, label: "Edit" },
  delete: { tone: "destructive", icon: Trash2, label: "Delete" },
};

function AuditPage() {
  const { can } = useAuth();
  const [entries, setEntries] = useState<MediaAuditEntry[]>([]);
  const [filter, setFilter] = useState<(typeof ACTIONS)[number]>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await listAuditLog(300));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!can("audit.view")) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <FileWarning className="size-8 mx-auto mb-2 text-muted-foreground/60" />
        You don't have permission to view the audit log.
      </Card>
    );
  }

  const filtered = filter === "all" ? entries : entries.filter((e) => e.action === filter);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Media Audit Log"
        description={
          loading
            ? "Loading…"
            : `${entries.length} recent activity event${entries.length === 1 ? "" : "s"}. Visible to Admin & Director only.`
        }
      />
      <DataSourceBanner classification="unverified" />

      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={`px-3 py-1.5 rounded-md border text-xs capitalize ${filter === a ? "bg-accent border-accent text-accent-foreground" : "border-border hover:bg-accent/40 text-muted-foreground"}`}
          >
            {a === "all" ? "All events" : (ACTION_META[a]?.label ?? a)}
          </button>
        ))}
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-2 py-2.5 font-medium">Action</th>
              <th className="px-2 py-2.5 font-medium">User</th>
              <th className="px-2 py-2.5 font-medium">Media</th>
              <th className="px-2 py-2.5 font-medium">Goalkeeper</th>
              <th className="px-4 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted-foreground">
                  No audit events yet.
                </td>
              </tr>
            ) : (
              filtered.map((e) => {
                const meta = ACTION_META[e.action] ?? {
                  tone: "muted" as const,
                  icon: FileWarning,
                  label: e.action,
                };
                const Icon = meta.icon;
                const gk = e.gk_id ? getGk(e.gk_id) : null;
                const changes =
                  e.metadata && typeof e.metadata === "object" && "changes" in e.metadata
                    ? (e.metadata as { changes: Record<string, { from: unknown; to: unknown }> })
                        .changes
                    : null;
                return (
                  <tr
                    key={e.id}
                    className="border-b border-border/60 last:border-0 hover:bg-accent/20 align-top"
                  >
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums font-mono whitespace-nowrap">
                      {formatDate(e.created_at)}{" "}
                      <span className="text-[10px]">
                        {new Date(e.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <Pill tone={meta.tone}>
                        <Icon className="size-2.5 mr-1 inline" />
                        {meta.label}
                      </Pill>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="font-medium">{e.actor_name ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        {e.actor_role ?? ""}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 max-w-[16rem]">
                      <div className="truncate">{e.media_title ?? "—"}</div>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">{gk?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-md">
                      {changes && Object.keys(changes).length > 0 ? (
                        <ul className="space-y-0.5">
                          {Object.entries(changes).map(([k, v]) => (
                            <li key={k}>
                              <span className="text-foreground font-medium">{k}:</span>{" "}
                              <span className="line-through">{JSON.stringify(v.from)}</span> →{" "}
                              {JSON.stringify(v.to)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span>
                          {e.metadata && Object.keys(e.metadata).length
                            ? JSON.stringify(e.metadata)
                            : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
