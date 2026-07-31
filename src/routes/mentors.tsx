import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Card, Avatar, ProgressBar, SectionTitle, Pill, DutyBadge, TrafficLight } from "@/components/primitives";
import { DataSourceBanner } from "@/lib/data-classification";
import { activeMentors, interactions, formatRelative, dutyStatusForMentor } from "@/lib/mock-data";
import { withPermission } from "@/components/require-permission";

export const Route = createFileRoute("/mentors")({ component: withPermission(MentorsPage, "mentors.view") });

function MentorsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Mentors" description="RPM's active mentor team. Mentors work collaboratively across the entire client roster — no per-goalkeeper assignment." />
      <DataSourceBanner classification="mock" extra="Monthly targets, completion percentages and activity leaderboard figures are illustrative." />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {activeMentors.map((m) => {
          const recent = interactions.filter((i) => i.mentorId === m.id).slice(0, 3);
          const target = m.targetInteractions || 0;
          const pct = target > 0 ? Math.round((m.completedThisMonth / target) * 100) : 0;
          const duty = dutyStatusForMentor(m.id);
          return (
            <Card key={m.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="relative">
                  <Avatar initials={m.initials} size={42} />
                  <div className="absolute -bottom-0.5 -right-0.5"><TrafficLight level={duty.level} size={12} /></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.role}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{m.region} · {m.yearsExperience} yrs</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <DutyBadge level={duty.level} label={duty.label} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Duty of Care</span>
              </div>
              {target > 0 ? (
                <div>
                  <div className="flex justify-between text-[11px] mb-1.5"><span className="text-muted-foreground uppercase tracking-wider">Monthly Interactions</span><span className="tabular-nums font-mono font-medium">{m.completedThisMonth}/{target}</span></div>
                  <ProgressBar value={pct} tone={pct < 60 ? "warning" : "primary"} />
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground italic">No monthly target set</div>
              )}
              <div className="border-t border-border pt-2.5 mt-auto">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Recent</div>
                {recent.length > 0 ? recent.map((r) => (
                  <div key={r.id} className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground truncate">{r.type}</span>
                    <span className="tabular-nums font-mono text-muted-foreground">{formatRelative(r.date)}</span>
                  </div>
                )) : (
                  <div className="text-[11px] text-muted-foreground italic">No recent activity</div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
