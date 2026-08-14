import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  Database,
  DownloadCloud,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSheetsIntegrationStatus } from "@/lib/integrations/sheets-status.functions";
import {
  importMatchReportsFromSheet,
  type MatchReportBackfillResult,
} from "@/lib/match-reports/backfill.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/system/integrations")({
  component: IntegrationsPage,
  head: () => ({
    meta: [
      { title: "Integrations · Mentor Hub" },
      {
        name: "description",
        content: "Google Sheets connector status and last successful write time.",
      },
      { property: "og:title", content: "Integrations · Mentor Hub" },
      {
        property: "og:description",
        content: "Google Sheets connector status and last successful write time.",
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function IntegrationsPage() {
  const { user, can } = useAuth();
  const fetchStatus = useServerFn(getSheetsIntegrationStatus);
  const runBackfill = useServerFn(importMatchReportsFromSheet);

  const [backfill, setBackfill] = useState<MatchReportBackfillResult | null>(null);
  const [backfillRunning, setBackfillRunning] = useState<"dry" | "import" | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const canManage = !!user && can("system.manage");

  const runReconcile = async (dryRun: boolean) => {
    setBackfillRunning(dryRun ? "dry" : "import");
    setBackfillError(null);
    try {
      setBackfill(await runBackfill({ data: { dryRun } }));
    } catch (e) {
      setBackfill(null);
      setBackfillError(e instanceof Error ? e.message : "The import could not be run.");
    } finally {
      setBackfillRunning(null);
    }
  };

  const q = useQuery({
    queryKey: ["integration-status", "google_sheets"],
    queryFn: () => fetchStatus(),
    enabled: canManage,
    refetchInterval: 30_000,
  });

  if (!canManage) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You need the Super Admin role to view integrations.
        </div>
      </div>
    );
  }

  const s = q.data;
  const healthy = s?.linked && s?.reachable && s?.sheetTabExists && !s?.error;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Runtime status for connected services.{" "}
            <Link to="/system/github" className="text-primary hover:underline">
              GitHub sync
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          {q.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </header>

      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-accent p-2">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-medium leading-tight">Match Reports store</h2>
              <p className="text-xs text-muted-foreground">Supabase · runtime source of truth</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 text-sm">
          <p className="text-muted-foreground">
            Match Reports are read and written directly in Supabase. The Google Sheet below is kept
            as a dormant archive — it is only touched by the import here, never by a page load or a
            submission.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runReconcile(true)}
              disabled={backfillRunning !== null}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {backfillRunning === "dry" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Reconcile against sheet (dry run)
            </button>
            <button
              type="button"
              onClick={() => runReconcile(false)}
              disabled={backfillRunning !== null}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {backfillRunning === "import" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <DownloadCloud className="h-4 w-4" />
              )}
              Import sheet history
            </button>
          </div>

          {backfillError && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive">
              <p className="font-medium">Import failed</p>
              <p className="mt-0.5 break-words">{backfillError}</p>
            </div>
          )}

          {backfill && (
            <div className="space-y-3">
              <div
                className={cn(
                  "rounded-md p-3",
                  backfill.ok ? "bg-accent" : "bg-destructive/10 text-destructive",
                )}
              >
                <p className="font-medium">
                  {backfill.dryRun ? "Dry run" : "Import"} —{" "}
                  {backfill.ok ? "reconciliation passed" : "reconciliation FAILED"}
                </p>
                {backfill.problems.map((p) => (
                  <p key={p} className="mt-0.5">
                    {p}
                  </p>
                ))}
              </div>
              <dl className="divide-y divide-border rounded-md border border-border">
                <Row label="Sheet rows read">{backfill.sheet.rawRows}</Row>
                <Row label="Valid sheet reports">{backfill.sheet.validReports}</Row>
                <Row label="Sheet rows skipped (unparseable)">{backfill.sheet.skippedRows}</Row>
                <Row label="Duplicate fixtures in sheet">
                  {backfill.sheet.duplicateBaseIds.length}
                </Row>
                <Row label="Supabase reports before">{backfill.supabase.totalBefore}</Row>
                <Row label="Supabase reports after">{backfill.supabase.totalAfter}</Row>
                <Row label="Supabase live (not deleted)">{backfill.supabase.liveAfter}</Row>
                <Row label="From sheet / from app">
                  {backfill.supabase.fromSheet} / {backfill.supabase.fromApp}
                </Row>
                <Row label="Rows written this run">{backfill.imported}</Row>
                <Row label="Skipped (app-owned / deleted)">
                  {backfill.skippedAppOwned} / {backfill.skippedTombstoned}
                </Row>
                <Row label="Missing in Supabase">{backfill.missingInSupabase.length}</Row>
                <Row label="Field mismatches">{backfill.fieldMismatches.length}</Row>
              </dl>
              {backfill.fieldMismatches.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {backfill.fieldMismatches.slice(0, 10).map((m) => (
                    <li key={`${m.report_id}-${m.field}`}>
                      <code>{m.report_id}</code> · {m.field}: sheet “{m.sheet}” vs Supabase “
                      {m.supabase}”
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-accent p-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-medium leading-tight">Google Sheets</h2>
              <p className="text-xs text-muted-foreground">
                Match Reports · archive &amp; rollback source only
              </p>
            </div>
          </div>
          <StatusPill
            healthy={!!healthy}
            loading={q.isLoading}
            label={
              q.isLoading
                ? "Checking…"
                : !s?.linked
                  ? "Not linked"
                  : !s?.reachable
                    ? "Unreachable"
                    : !s?.sheetTabExists
                      ? "Tab missing"
                      : "Connected"
            }
          />
        </div>

        <dl className="divide-y divide-border text-sm">
          <Row label="Connector">
            <code className="text-xs">google_sheets</code>
          </Row>
          <Row label="Linked">
            <BoolPill value={!!s?.linked} />
          </Row>
          <Row label="Gateway reachable">
            <BoolPill value={!!s?.reachable} />
          </Row>
          <Row label="Spreadsheet">
            {s?.spreadsheetTitle ? (
              <a
                href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                {s.spreadsheetTitle}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Row>
          <Row label="Sheet tab">
            <span className="inline-flex items-center gap-2">
              <span>{s?.sheetTab ?? "—"}</span>
              {s && <BoolPill value={s.sheetTabExists} />}
            </span>
          </Row>
          <Row label="Last sheet sync recorded">
            <div className="flex flex-col items-end">
              <span className={cn(!s?.lastWriteAt && "text-muted-foreground")}>
                {fmtRelative(s?.lastWriteAt ?? null)}
              </span>
              {s?.lastWriteAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(s.lastWriteAt).toLocaleString()}
                </span>
              )}
            </div>
          </Row>
          <Row label="Reports imported from sheet">
            <span>{s?.totalWrites ?? 0}</span>
          </Row>
          <Row label="Checked">
            <span className="text-muted-foreground">
              {s?.checkedAt ? fmtRelative(s.checkedAt) : "—"}
            </span>
          </Row>
        </dl>

        {s && s.headerMismatches.length > 0 && (
          <div className="border-t border-border bg-warning/10 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
              <div className="space-y-2">
                <p className="font-medium">Column headers don't match the app's mapping</p>
                <p className="text-muted-foreground">
                  The archive is parsed by column position. Fix these headers in the sheet before
                  importing its history again.
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {s.headerMismatches.map((m) => (
                    <li key={m.column}>
                      <code>{m.column}1</code> — expected “{m.expected}”, found{" "}
                      {m.actual ? `“${m.actual}”` : <em>empty</em>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {s?.error && (
          <div className="border-t border-border bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Error</p>
                <p className="mt-0.5 break-words">{s.error}</p>
              </div>
            </div>
          </div>
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

function BoolPill({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-xs text-success">
      <CheckCircle2 className="h-3 w-3" /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
      <XCircle className="h-3 w-3" /> No
    </span>
  );
}

function StatusPill({
  healthy,
  loading,
  label,
}: {
  healthy: boolean;
  loading: boolean;
  label: string;
}) {
  const tone = loading
    ? "border-border bg-accent text-muted-foreground"
    : healthy
      ? "border-success/30 bg-success/15 text-success"
      : "border-destructive/30 bg-destructive/15 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone,
      )}
    >
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
