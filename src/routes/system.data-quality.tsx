import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
import { listPlayers } from "@/lib/players.functions";
import { toGoalkeepers } from "@/lib/roster/live-goalkeepers";
import { countWithoutPresentation } from "@/lib/roster/seed-presentation";
import {
  auditRoster,
  summarise,
  ISSUE_LABEL,
  ISSUE_REMEDIATION,
  NOT_CAPTURED_FIELDS,
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

/** "date of birth, age, height, shirt number, preferred foot or portrait". */
const NOT_CAPTURED_SENTENCE = `${NOT_CAPTURED_FIELDS.slice(0, -1).join(", ")} or ${
  NOT_CAPTURED_FIELDS[NOT_CAPTURED_FIELDS.length - 1]
}`;

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
  // The same query key and mapping `/goalkeepers` uses, so this page and the
  // roster cannot disagree about who is on it. Auditing the frozen seed array
  // meant checking records nobody sees: it missed every goalkeeper signed since
  // the snapshot and reported issues on values the app no longer renders.
  const listPlayersFn = useServerFn(listPlayers);
  const {
    data: playerRows,
    isPending: rosterPending,
    isError: rosterUnavailable,
  } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  const roster = useMemo(() => toGoalkeepers(playerRows), [playerRows]);

  // Only the checks `public.players` can answer. The rest are counted below
  // rather than flagged per goalkeeper — see `NOT_CAPTURED_CODES`.
  const reports = useMemo(
    () => auditRoster(roster, new Date(), { databaseBackedOnly: true }),
    [roster],
  );
  const summary = useMemo(() => summarise(reports), [reports]);
  const notCaptured = useMemo(
    () => countWithoutPresentation(roster.map((gk) => gk.name)),
    [roster],
  );

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

  // The roster is a database read now, so the page says which of the three it
  // is — loading, unreachable, or here — rather than rendering empty tiles that
  // read as "the roster is clean".
  if (rosterUnavailable) {
    return (
      <div className="space-y-6">
        <PageIntro description="Roster unavailable." />
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <AlertCircle className="size-8 mx-auto text-destructive" />
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            The roster could not be loaded, so nothing has been audited. Refresh the page to try
            again.
          </p>
        </div>
      </div>
    );
  }

  if (rosterPending) {
    return (
      <div className="space-y-6">
        <PageIntro description="Loading the roster…" />
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground" role="status">
            Reading the roster from the database…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        description={`Automated checks across the ${summary.totalGoalkeepers} goalkeepers on the live roster — nationality, club, league, tier, contract and parent club.`}
      >
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 h-9 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent"
        >
          <Download className="size-4" /> Export CSV
        </button>
      </PageIntro>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Roster size"
          value={summary.totalGoalkeepers}
          tone="muted"
          icon={CheckCircle2}
        />
        <SummaryTile
          label="Goalkeepers with issues"
          value={summary.goalkeepersWithIssues}
          tone={summary.goalkeepersWithIssues > 0 ? "warning" : "success"}
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

      {/* The checks this audit deliberately does not run. */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <h2 className="text-sm font-semibold">Not captured in the database yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                public.players
              </code>{" "}
              has no column for {NOT_CAPTURED_SENTENCE}, so the audit above does not check them.
              Flagging them per goalkeeper would be true and unfixable — there is no field to go and
              fill in.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {notCaptured === 0
                ? "Every goalkeeper on the roster still carries these from the last seed snapshot."
                : `${notCaptured} of ${summary.totalGoalkeepers} goalkeepers have none of them on file — they joined the roster after that snapshot was taken.`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold text-muted-foreground">{notCaptured}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Without any</div>
          </div>
        </div>
      </section>

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

/** The title block, shared by the loading, error and loaded states. */
function PageIntro({ description, children }: { description: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roster data quality</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      {children}
    </header>
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
                  <Wrench className="size-3.5 mt-0.5 text-primary-ink shrink-0" />
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
