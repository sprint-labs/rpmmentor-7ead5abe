import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Github,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getGithubSyncStatus } from "@/lib/integrations/github-status.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/system/github")({
  component: GithubSyncPage,
  head: () => ({
    meta: [
      { title: "GitHub Sync · Mentor Hub" },
      {
        name: "description",
        content: "Last sync time, current main branch SHA and sync errors for the connected GitHub repository.",
      },
      { property: "og:title", content: "GitHub Sync · Mentor Hub" },
      {
        property: "og:description",
        content: "Last sync time, current main branch SHA and sync errors for the connected GitHub repository.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function fmtRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || !Number.isFinite(diff)) return new Date(iso).toLocaleString();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function GithubSyncPage() {
  const { user, can } = useAuth();
  const fetchStatus = useServerFn(getGithubSyncStatus);
  const canManage = !!user && can("system.manage");

  const q = useQuery({
    queryKey: ["integration-status", "github"],
    queryFn: () => fetchStatus(),
    enabled: canManage,
    refetchInterval: 60_000,
  });

  if (!canManage) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You need the Super Admin role to view GitHub sync status.
        </div>
      </div>
    );
  }

  const s = q.data;
  const healthy = !!s?.reachable && !s?.error;
  const queryError = q.error instanceof Error ? q.error.message : q.error ? String(q.error) : null;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GitHub sync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Repository sync state for this project.{" "}
            <Link to="/system/integrations" className="text-primary hover:underline">
              All integrations
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </header>

      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-accent p-2">
              <Github className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-medium leading-tight">
                {s ? `${s.owner}/${s.repo}` : "Repository"}
              </h2>
              <p className="text-xs text-muted-foreground">Two-way sync · source code</p>
            </div>
          </div>
          <StatusPill
            healthy={healthy}
            loading={q.isLoading}
            label={
              q.isLoading ? "Checking…" : queryError ? "Error" : !s?.reachable ? "Unreachable" : "In sync"
            }
          />
        </div>

        <dl className="divide-y divide-border text-sm">
          <Row label="Repository">
            {s ? (
              <a
                href={s.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                {s.owner}/{s.repo}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
          <Row label="Branch">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              {s?.branch ?? "—"}
            </span>
          </Row>
          <Row label="Last sync (pushed to GitHub)">
            <div className="flex flex-col items-end">
              <span className={cn(!s?.lastSyncAt && "text-muted-foreground")}>
                {fmtRelative(s?.lastSyncAt ?? null)}
              </span>
              {s?.lastSyncAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(s.lastSyncAt).toLocaleString()}
                </span>
              )}
            </div>
          </Row>
          <Row label={`Current ${s?.branch ?? "main"} SHA`}>
            {s?.head ? (
              <a
                href={s.head.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
              >
                {s.head.shortSha}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
          <Row label="Head commit">
            <span className="text-right">
              {s?.head ? (
                <>
                  <span className="block max-w-sm truncate">{s.head.message}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.head.author ?? "unknown"} · {fmtRelative(s.head.committedAt)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </Row>
          <Row label="Connector auth">
            <span className="text-xs text-muted-foreground">
              {s?.linked ? "GitHub connector (gateway)" : "Public API (unauthenticated)"}
            </span>
          </Row>
          <Row label="Checked">
            <span className="text-muted-foreground">{s?.checkedAt ? fmtRelative(s.checkedAt) : "—"}</span>
          </Row>
        </dl>

        {(queryError || s?.error) && (
          <div className="border-t border-border bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Sync error</p>
                <p className="mt-0.5 break-words">{queryError ?? s?.error}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <h2 className="border-b border-border p-4 text-sm font-medium">Recent commits on {s?.branch ?? "main"}</h2>
        {q.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : s && s.recent.length > 0 ? (
          <ul className="divide-y divide-border">
            {s.recent.map((c) => (
              <li key={c.sha} className="flex items-start justify-between gap-4 p-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{c.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.author ?? "unknown"} · {fmtRelative(c.committedAt)}
                  </p>
                </div>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-xs text-primary hover:underline"
                >
                  {c.shortSha}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">No commits available.</div>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function StatusPill({ healthy, loading, label }: { healthy: boolean; loading: boolean; label: string }) {
  const tone = loading
    ? "border-border bg-accent text-muted-foreground"
    : healthy
      ? "border-success/30 bg-success/15 text-success"
      : "border-destructive/30 bg-destructive/15 text-destructive";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", tone)}>
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : healthy ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
