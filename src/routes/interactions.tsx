import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, Card, Pill, Avatar, EmptyState } from "@/components/primitives";
import { interactions, getGk, getMentor, formatDate, formatRelative } from "@/lib/mock-data";
import { useEffect, useMemo, useState } from "react";
import { X, MessageSquarePlus, Filter } from "lucide-react";
import { withPermission } from "@/components/require-permission";
import { getNavSource } from "@/lib/nav-source";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { useAuth } from "@/lib/auth";

const interactionsSearchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  mentorId: fallback(z.string(), "").default(""),
  type: fallback(z.string(), "").default(""),
  source: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/interactions")({
  validateSearch: zodValidator(interactionsSearchSchema),
  component: withPermission(InteractionsPage, "interactions.view"),
});

const TYPES = ["All", "Live Match Observation", "Training Ground Visit", "Coffee Catch Up", "Phone Call"] as const;

const PLANNED_TO_TYPE: Record<string, (typeof TYPES)[number]> = {
  "Attend Live Match": "Live Match Observation",
  "Training Ground Visit": "Training Ground Visit",
  "Coffee Catch Up": "Coffee Catch Up",
};

function resolveType(param: string): (typeof TYPES)[number] {
  if (!param) return "All";
  if ((TYPES as readonly string[]).includes(param)) return param as (typeof TYPES)[number];
  return PLANNED_TO_TYPE[param] ?? "All";
}

function InteractionsPage() {
  const { can } = useAuth();
  const { from, to, mentorId, type: typeParam, source } = Route.useSearch();
  const navSource = getNavSource(source);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]>(() => resolveType(typeParam));
  useEffect(() => {
    if (typeParam) setType(resolveType(typeParam));
  }, [typeParam]);
  const sorted = useMemo(() => [...interactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)), []);
  const filtered = useMemo(() => {
    let list = sorted;
    if (mentorId) list = list.filter((i) => i.mentorId === mentorId);
    if (from && to) {
      const start = new Date(from).getTime();
      const end = new Date(to).getTime();
      list = list.filter((i) => {
        const t = new Date(i.date).getTime();
        return t >= start && t <= end;
      });
    }
    if (type !== "All") list = list.filter((i) => i.type === type);
    return list;
  }, [sorted, mentorId, from, to, type]);

  const hasFilters = Boolean(mentorId) || (Boolean(from) && Boolean(to)) || Boolean(typeParam);
  const clearSearch = { from: "", to: "", mentorId: "", type: "", source: "" };

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={
          navSource
            ? [
                { label: "Dashboard", to: "/" },
                { label: navSource.label },
              ]
            : undefined
        }
        title={navSource?.title ?? "Interaction Tracking"}
        description="Every logged touchpoint between mentors and goalkeepers."
        action={can("interactions.log") ? (
          <button
            onClick={() => setWorkflow("interaction")}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Log Interaction
          </button>
        ) : undefined}
      />
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${type === t ? "bg-accent border-accent text-accent-foreground" : "border-border hover:bg-accent/40 text-muted-foreground"}`}>{t}</button>
        ))}
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider">Scoped to:</span>
          {mentorId && <Pill tone="muted">{getMentor(mentorId)?.name ?? mentorId}</Pill>}
          {from && to && <Pill tone="muted">{new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(to).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Pill>}
          <Link to="/interactions" search={clearSearch} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground ml-2">
            <X className="size-3" /> Clear
          </Link>
        </div>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-2 py-2.5 font-medium">Type</th>
              <th className="px-2 py-2.5 font-medium">Goalkeeper</th>
              <th className="px-2 py-2.5 font-medium">Mentor</th>
              <th className="px-2 py-2.5 font-medium">Notes</th>
              <th className="px-2 py-2.5 font-medium">Outcome</th>
              <th className="px-4 py-2.5 font-medium">Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-2">
                  <EmptyState
                    icon={hasFilters ? Filter : MessageSquarePlus}
                    title={hasFilters ? "No interactions match these filters" : "No interactions logged yet"}
                    description={
                      hasFilters
                        ? "Try broadening the date range, mentor or type filter to see more touchpoints."
                        : "Log the first touchpoint — a call, coffee catch up, or match observation — to begin the interaction record."
                    }
                    primaryAction={
                      hasFilters ? (
                        <Link
                          to="/interactions"
                          search={clearSearch}
                          className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
                        >
                          <X className="size-3.5" /> Clear filters
                        </Link>
                      ) : can("interactions.log") ? (
                        <button
                          onClick={() => setWorkflow("interaction")}
                          className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
                        >
                          <MessageSquarePlus className="size-3.5" /> Log interaction
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
            {filtered.slice(0, 80).map((i) => {
              const gk = getGk(i.gkId);
              const m = getMentor(i.mentorId);
              return (
                <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums font-mono">{formatDate(i.date)}<div className="text-[10px] opacity-60">{formatRelative(i.date)}</div></td>
                  <td className="px-2"><Pill tone="info">{i.type}</Pill></td>
                  <td className="px-2"><div className="flex items-center gap-2"><Avatar initials={gk?.initials ?? "?"} size={22} /><span className="font-medium">{gk?.name}</span></div></td>
                  <td className="px-2 text-muted-foreground">{m?.name}</td>
                  <td className="px-2 text-muted-foreground max-w-md"><span className="line-clamp-1">{i.notes}</span></td>
                  <td className="px-2"><Pill>{i.outcome}</Pill></td>
                  <td className="px-4 text-muted-foreground"><span className="line-clamp-1">{i.followUp}</span></td>
                </tr>
              );
            })}
          </tbody>

        </table>
      </Card>
      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} />
    </div>
  );
}
