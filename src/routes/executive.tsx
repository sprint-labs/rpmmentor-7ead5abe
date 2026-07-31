import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Card, StatCard, SectionTitle, TierBadge, ProgressBar, Pill } from "@/components/primitives";
import { goalkeepers, mentors, reports, interactions, stats } from "@/lib/mock-data";
import { withPermission } from "@/components/require-permission";

export const Route = createFileRoute("/executive")({ component: withPermission(Executive, "executive.view") });

function Executive() {
  const reportsByType = ["Goalkeeper Development", "Match Report", "Training Report", "Opposition GK", "Recruitment"].map((t) => ({
    type: t, count: reports.filter((r) => r.type === t).length,
  }));
  const pipeline = {
    Sign: goalkeepers.filter((g) => g.recommendation === "Sign").length,
    Monitor: goalkeepers.filter((g) => g.recommendation === "Monitor").length,
    Loan: goalkeepers.filter((g) => g.recommendation === "Loan").length,
    Pass: goalkeepers.filter((g) => g.recommendation === "Pass").length,
  };
  const coverage = Math.round((goalkeepers.filter((g) => (Date.now() - +new Date(g.lastInteraction)) / 86400000 < 30).length / goalkeepers.length) * 100);
  const avgInteractions = (interactions.length / mentors.length).toFixed(1);

  // last 8 weeks report volume
  const weeks = Array.from({ length: 8 }).map((_, i) => {
    const start = Date.now() - (8 - i) * 7 * 86400000;
    const end = start + 7 * 86400000;
    const count = reports.filter((r) => { const t = +new Date(r.date); return t >= start && t < end; }).length;
    return { label: `W${i + 1}`, count };
  });
  const maxW = Math.max(...weeks.map((w) => w.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Executive Dashboard" description="Strategic overview for directors and Head of Goalkeeping." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="GK Coverage (30d)" value={`${coverage}%`} hint="Observed in last month" accent="primary" />
        <StatCard label="Active Mentors" value={mentors.length} hint={`${avgInteractions} avg interactions ea.`} />
        <StatCard label="Reports Submitted" value={reports.length} hint="All-time" accent="info" />
        <StatCard label="Recruitment Targets" value={pipeline.Sign} hint="Marked as Sign" accent="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <SectionTitle>Report Volume — Last 8 Weeks</SectionTitle>
          <div className="flex items-end gap-2 h-48">
            {weeks.map((w) => (
              <div key={w.label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="text-[10px] tabular-nums font-mono text-muted-foreground">{w.count}</div>
                <div className="w-full bg-primary/70 rounded-t hover:bg-primary transition-colors" style={{ height: `${(w.count / maxW) * 100}%` }} />
                <div className="text-[10px] text-muted-foreground">{w.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Status Distribution</SectionTitle>
          <div className="space-y-3">
            {stats.tierDistribution.map((t) => {
              const pct = Math.round((t.count / stats.totalGks) * 100);
              const color = t.tier === "Tier 1" ? "bg-warning" : t.tier === "Tier 2" ? "bg-info" : t.tier === "Tier 3" ? "bg-primary" : t.tier === "Academy" ? "bg-tier-3" : "bg-muted-foreground/40";
              return (
                <div key={t.tier}>
                  <div className="flex items-center justify-between text-xs mb-1.5"><TierBadge tier={t.tier as never} /><span className="tabular-nums font-mono">{t.count} · {pct}%</span></div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle>Reports by Type</SectionTitle>
          <div className="space-y-2.5">
            {reportsByType.map((r) => (
              <div key={r.type}>
                <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">{r.type}</span><span className="tabular-nums font-mono font-medium">{r.count}</span></div>
                <ProgressBar value={(r.count / reports.length) * 100} tone="info" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Recruitment Pipeline</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(pipeline).map(([k, v]) => (
              <div key={k} className="p-3 rounded-md border border-border/60 bg-accent/20">
                <div className="flex items-center justify-between"><Pill tone={k === "Sign" ? "success" : k === "Pass" ? "destructive" : k === "Monitor" ? "info" : "warning"}>{k}</Pill><span className="text-2xl font-semibold tabular-nums font-mono">{v}</span></div>
                <div className="text-[11px] text-muted-foreground mt-1">{Math.round((v / goalkeepers.length) * 100)}% of pool</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle>Mentor Activity Leaderboard</SectionTitle>
        <div className="space-y-2">
          {[...mentors].sort((a, b) => b.completedThisMonth - a.completedThisMonth).map((m, i) => (
            <div key={m.id} className="flex items-center gap-3">
              <div className="w-6 text-xs tabular-nums font-mono text-muted-foreground">{i + 1}</div>
              <div className="w-40 text-sm font-medium truncate">{m.name}</div>
              <div className="text-[11px] text-muted-foreground w-32 truncate">{m.region}</div>
              <div className="flex-1"><ProgressBar value={(m.completedThisMonth / m.targetInteractions) * 100} /></div>
              <div className="text-xs tabular-nums font-mono w-16 text-right">{m.completedThisMonth}/{m.targetInteractions}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
