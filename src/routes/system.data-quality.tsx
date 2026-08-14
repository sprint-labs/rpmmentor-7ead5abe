import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Search,
  Download,
  Wrench,
} from "lucide-react";
import { RequirePermission } from "@/components/require-permission";
import { goalkeepers } from "@/lib/mock-data";
import {
  auditRoster,
  summarise,
  ISSUE_LABEL,
  ISSUE_REMEDIATION,
  type IssueSeverity,
  type IssueCode,
  type GoalkeeperQualityReport,
} from "@/lib/roster-quality";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/system/data-quality")({
  component: DataQualityPage,
  head: () => ({
    meta: [
      { title: "Roster Data Quality · Mentor Hub" },
      {
        name: "description",
        content:
          "Flags missing or inconsistent goalkeeper roster fields such as nationality, parent club, and contract status.",
      },
      { property: "og:title", content: "Roster Data Quality · Mentor Hub" },
      {
        property: "og:description",
        content: "Flags missing or inconsistent goalkeeper roster fields.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SEVERITY_STYLE: Record<
  IssueSeverity,
  { icon: typeof AlertCircle; badge: string; row: string; label: string }
> = {
  error: {
    icon: AlertCircle,
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    row: "border-l-destructive",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    badge: "bg-warning/15 text-warning border-warning/30",
    row: "border-l-warning",
    label: "Warning",
  },
  info: {
    icon: Info,
    badge: "bg-muted text-muted-foreground border-border",
    row: "border-l-border",
    label: "Info",
  },
};

function DataQualityPage() {
  return (
    <RequirePermission permission="system.manage">
      <DataQualityInner />
    </RequirePermission>
  );
}

function DataQualityInner() {
  const reports = useMemo(() => auditRoster(goalkeepers), []);
  const summary = useMemo(() => summarise(reports), [reports]);

  const [severity, setSeverity] = useState<"all" | IssueSeverity>("all");
  const [code, setCode] = useState<"all" | IssueCode>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return reports
      .filter((r) => r.issues.length > 0)
      .map((r) => {
        const issues = r.issues.filter((i) => {
          if (severity !== "all" && i.severity !== severity) return false;
          if (code !== "all" && i.code !== code) return false;
          return true;
        });
        return { ...r, issues };
      })
      .filter((r) => r.issues.length > 0)
      .filter((r) => {
        if (!q.trim()) return true;
        const needle = q.toLowerCase();
        return (
          r.gk.name.toLowerCase().includes(needle) ||
          r.gk.club?.toLowerCase().includes(needle) ||
          r.gk.nationality?.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.score - b.score);
  }, [reports, severity, code, q]);

  const activeCodes = useMemo(
    () =>
      (Object.entries(summary.byCode) as [IssueCode, number][])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]),
    [summary.byCode],
  );

  const exportCsv = () => {
    const rows: string[] = ["goalkeeper,club,severity,code,field,message"];
    for (const r of reports) {
      for (const i of r.issues) {
        const cells = [r.gk.name, r.gk.club ?? "", i.severity, i.code, i.field, i.message].map(
          (c) => `"${String(c).replace(/"/g, '""')}"`,
        );
        rows.push(cells.join(","));
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-data-quality-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roster data quality</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated checks for missing or inconsistent goalkeeper fields — nationality, parent
            club, contract status and more.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 h-9 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent"
        >
          <Download className="size-4" /> Export CSV
        </button>
      </header>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Roster size"
          value={summary.totalKeepers}
          tone="muted"
          icon={CheckCircle2}
        />
        <SummaryTile
          label="Keepers with issues"
          value={summary.keepersWithIssues}
          tone={summary.keepersWithIssues > 0 ? "warning" : "success"}
          icon={AlertTriangle}
        />
        <SummaryTile
          label="Errors"
          value={summary.bySeverity.error}
          tone={summary.bySeverity.error > 0 ? "error" : "success"}
          icon={AlertCircle}
        />
        <SummaryTile
          label="Warnings"
          value={summary.bySeverity.warning}
          tone={summary.bySeverity.warning > 0 ? "warning" : "success"}
          icon={AlertTriangle}
        />
      </div>

      {/* Filters */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search goalkeeper, club, nationality…"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-sm"
              aria-label="Search"
            />
          </div>
          <SeverityToggle value={severity} onChange={setSeverity} summary={summary.bySeverity} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip active={code === "all"} onClick={() => setCode("all")}>
            All issue types{" "}
            <span className="ml-1 text-muted-foreground">({summary.totalIssues})</span>
          </Chip>
          {activeCodes.map(([c, n]) => (
            <Chip key={c} active={code === c} onClick={() => setCode(c)}>
              {ISSUE_LABEL[c]} <span className="ml-1 text-muted-foreground">({n})</span>
            </Chip>
          ))}
        </div>
      </section>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <CheckCircle2 className="size-8 mx-auto text-success" />
          <h2 className="mt-3 text-lg font-semibold">No issues match these filters</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.totalIssues === 0
              ? "The roster passes every data quality check."
              : "Try clearing filters to see the full list."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <ReportCard key={r.gk.id} report={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "muted" | "success" | "warning" | "error";
  icon: typeof AlertCircle;
}) {
  const toneClass =
    tone === "error"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("size-4", toneClass)} />
      </div>
      <div className={cn("mt-2 text-2xl font-semibold", toneClass)}>{value}</div>
    </div>
  );
}

function SeverityToggle({
  value,
  onChange,
  summary,
}: {
  value: "all" | IssueSeverity;
  onChange: (v: "all" | IssueSeverity) => void;
  summary: Record<IssueSeverity, number>;
}) {
  const opts: Array<{ v: "all" | IssueSeverity; label: string; count: number }> = [
    { v: "all", label: "All", count: summary.error + summary.warning + summary.info },
    { v: "error", label: "Errors", count: summary.error },
    { v: "warning", label: "Warnings", count: summary.warning },
    { v: "info", label: "Info", count: summary.info },
  ];
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "px-3 h-9 text-xs font-medium border-r border-border last:border-r-0",
            value === o.v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
          )}
        >
          {o.label} <span className="opacity-70">({o.count})</span>
        </button>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center h-7 px-2.5 rounded-full border text-xs",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function ReportCard({ report }: { report: GoalkeeperQualityReport }) {
  const topSeverity: IssueSeverity = report.issues.some((i) => i.severity === "error")
    ? "error"
    : report.issues.some((i) => i.severity === "warning")
      ? "warning"
      : "info";
  const s = SEVERITY_STYLE[topSeverity];
  return (
    <li className={cn("rounded-lg border border-border bg-card border-l-4 p-4", s.row)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            to="/goalkeepers/$gkId"
            params={{ gkId: report.gk.id }}
            className="text-sm font-semibold hover:underline"
          >
            {report.gk.name}
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">
            {report.gk.club || "—"}
            {report.gk.league ? ` · ${report.gk.league}` : ""}
            {report.gk.nationality ? ` · ${report.gk.nationality}` : ""}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Quality score <span className="font-mono text-foreground">{report.score}</span>/100
        </div>
      </div>

      <ul className="mt-3 space-y-2.5">
        {report.issues.map((issue, idx) => {
          const st = SEVERITY_STYLE[issue.severity];
          const Icon = st.icon;
          const fix = ISSUE_REMEDIATION[issue.code];
          return (
            <li key={idx} className="rounded-md border border-border bg-background/40 p-2.5">
              <div className="flex items-start gap-2 text-sm">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[10px] uppercase tracking-wide shrink-0",
                    st.badge,
                  )}
                >
                  <Icon className="size-3" /> {st.label}
                </span>
                <span className="text-muted-foreground">
                  <span className="text-foreground font-medium">{ISSUE_LABEL[issue.code]}</span>
                  {" — "}
                  {issue.message}
                </span>
              </div>
              {fix && (
                <div className="mt-2 ml-1 flex items-start gap-2 text-xs">
                  <Wrench className="size-3.5 mt-0.5 text-primary shrink-0" />
                  <div className="space-y-1">
                    <div>
                      <span className="font-medium text-foreground">Suggested fix: </span>
                      <span className="text-muted-foreground">{fix.action}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground">Update:</span>
                      {fix.fields.map((f) => (
                        <code
                          key={f}
                          className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]"
                        >
                          {f}
                        </code>
                      ))}
                    </div>
                    {fix.hint && <p className="text-muted-foreground italic">{fix.hint}</p>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
