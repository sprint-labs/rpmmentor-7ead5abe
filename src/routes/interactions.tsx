import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PageHeader, Pill } from "@/components/primitives";
import { getMentor } from "@/lib/mock-data";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { DASHBOARD_INTERACTION_TYPES, type LoggedInteraction } from "@/lib/interactions/schema";
import { withPermission } from "@/components/require-permission";
import { getNavSource } from "@/lib/nav-source";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { useAuth } from "@/lib/auth";
import { InteractionWorkbench } from "@/components/interaction-workbench";
import { InteractionActions } from "@/components/interactions/interaction-actions";
import { DeleteInteractionDialog } from "@/components/interactions/delete-interaction-dialog";
import { isDateOnlyInPeriod, lastNDaysPeriod } from "@/lib/dashboard-period";

const interactionsSearchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  mentorId: fallback(z.string(), "").default(""),
  type: fallback(z.string(), "").default(""),
  source: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  /** Kept so older links still parse; the list now scrolls instead of paging. */
  page: fallback(z.number().int(), 1).default(1),
  /**
   * Opening the Log Interaction dialog straight from a follow-up. `eventId` is
   * the event being written up; the saved interaction is linked back to it.
   */
  openLog: fallback(z.string(), "").default(""),
  gkId: fallback(z.string(), "").default(""),
  date: fallback(z.string(), "").default(""),
  eventId: fallback(z.string(), "").default(""),
});

export type InteractionsSearch = z.infer<typeof interactionsSearchSchema>;

export const Route = createFileRoute("/interactions")({
  validateSearch: zodValidator(interactionsSearchSchema),
  head: () => ({
    meta: [{ title: "Interactions — Mentor Hub" }, { name: "robots", content: "noindex" }],
  }),
  component: withPermission(InteractionsPage, "interactions.view"),
});

const PLANNED_TO_TYPE: Record<string, string> = {
  "Training Ground Visit": "Training Ground Visit",
  "Coffee Catch Up": "Coffee Catch Up",
};

/** A type deep-linked from a dashboard card, if it is one the list can filter by. */
function resolveType(param: string): string {
  if (!param) return "";
  if ((DASHBOARD_INTERACTION_TYPES as readonly string[]).includes(param)) return param;
  if (param === "Live Match Observation") return param;
  return PLANNED_TO_TYPE[param] ?? "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PERIOD_PRESETS = [7, 14, 30, 90] as const;

function presetFor(fromDate: string, toDate: string): string {
  if (!fromDate && !toDate) return "all";
  for (const days of PERIOD_PRESETS) {
    const period = lastNDaysPeriod(days);
    if (period.fromDate === fromDate && period.toDate === toDate) return String(days);
  }
  return "custom";
}

function InteractionsPage() {
  const { can } = useAuth();
  const navigate = useNavigate({ from: "/interactions" });
  const search = Route.useSearch();
  const {
    from,
    to,
    mentorId,
    type: typeParam,
    source,
    q,
    openLog,
    gkId: prefillGkId,
    date: prefillDate,
    eventId: followUpEventId,
  } = search;
  const navSource = getNavSource(source);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const [editing, setEditing] = useState<LoggedInteraction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LoggedInteraction | null>(null);
  const [logContext, setLogContext] = useState<{
    gkId?: string;
    date?: string;
    eventId?: string;
  }>({});

  // Arriving from a follow-up link: open the form ready to write up that event.
  // The one-shot parameters are stripped so a refresh does not reopen it.
  useEffect(() => {
    if (openLog !== "1" || !can("interactions.log")) return;
    setLogContext({ gkId: prefillGkId, date: prefillDate, eventId: followUpEventId });
    setWorkflow("interaction");
    navigate({
      search: (prev) => ({ ...prev, openLog: "", gkId: "", date: "", eventId: "" }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLog, prefillGkId, prefillDate, followUpEventId]);

  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);
  const hasPeriod = Boolean(fromDate) && Boolean(toDate);
  const preset = presetFor(hasPeriod ? fromDate : "", hasPeriod ? toDate : "");
  const periodLabel = hasPeriod ? `${fromDate} → ${toDate}` : "All time";

  const { data, isLoading, isError } = useLoggedInteractions();

  const mentorScopeName = useMemo(() => {
    if (!mentorId) return "";
    const fromRows = (data ?? []).find((i) => i.mentorId === mentorId)?.mentorName;
    return fromRows || getMentor(mentorId)?.name || "";
  }, [data, mentorId]);

  // One shared, already-loaded list (the same cache the dashboard reads), so
  // the period and mentor scope are applied here rather than in Postgres.
  const rows = useMemo(() => {
    return (data ?? []).filter((i) => {
      if (hasPeriod && !isDateOnlyInPeriod(i.occurredAt, fromDate, toDate)) return false;
      if (mentorId) {
        if (UUID.test(mentorId)) return i.mentorId === mentorId;
        return Boolean(mentorScopeName) && i.mentorName === mentorScopeName;
      }
      return true;
    });
  }, [data, hasPeriod, fromDate, toDate, mentorId, mentorScopeName]);

  const setPeriod = (value: string) => {
    if (value === "all") {
      navigate({ search: (prev) => ({ ...prev, from: "", to: "" }) });
      return;
    }
    const days = Number(value);
    if (!Number.isInteger(days)) return;
    const period = lastNDaysPeriod(days);
    navigate({ search: (prev) => ({ ...prev, from: period.fromDate, to: period.toDate }) });
  };

  const initialType = resolveType(typeParam);

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={
          navSource ? [{ label: "Dashboard", to: "/" }, { label: navSource.label }] : undefined
        }
        title="Interactions"
        description="Every logged touchpoint between mentors and goalkeepers."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label>
              <span className="sr-only">Period</span>
              <select
                value={preset}
                onChange={(event) => setPeriod(event.target.value)}
                className="h-9 rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All time</option>
                {PERIOD_PRESETS.map((days) => (
                  <option key={days} value={String(days)}>
                    Last {days} days
                  </option>
                ))}
                {preset === "custom" && <option value="custom">{periodLabel}</option>}
              </select>
            </label>
            {can("interactions.log") && (
              <button
                onClick={() => setWorkflow("interaction")}
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              >
                Log Interaction
              </button>
            )}
          </div>
        }
      />

      {mentorId && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider">Scoped to:</span>
          <Pill tone="muted">{mentorScopeName || "One mentor"}</Pill>
          <Link
            to="/interactions"
            search={(prev) => ({ ...prev, mentorId: "" })}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground ml-2"
          >
            <X className="size-3" /> Show all mentors
          </Link>
        </div>
      )}

      <div className="command-panel p-3 sm:p-5">
        {isLoading ? (
          <Empty label="Loading…" />
        ) : isError ? (
          <Empty label="Interactions could not be loaded. Please refresh." />
        ) : rows.length === 0 ? (
          <div className="pb-8 text-center">
            <Empty
              label={
                hasPeriod || mentorId
                  ? "No interactions in this period"
                  : "No interactions logged yet"
              }
            />
            {(hasPeriod || mentorId) && (
              <Link
                to="/interactions"
                search={{ from: "", to: "", mentorId: "", type: "", source: "", q: "" }}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-accent/40"
              >
                <X className="size-3.5" /> Show all interactions
              </Link>
            )}
          </div>
        ) : (
          <InteractionWorkbench
            key={`${initialType}|${q}`}
            interactions={rows}
            periodLabel={periodLabel}
            scopeLabel={mentorScopeName || undefined}
            initialFilters={initialType ? { type: initialType } : undefined}
            initialSearch={q}
            onOpenCompact={(interaction) =>
              navigate({
                to: "/interactions/$interactionId",
                params: { interactionId: interaction.id },
              })
            }
            renderActions={(interaction) => (
              <InteractionActions
                interaction={interaction}
                onEdit={setEditing}
                onDelete={setPendingDelete}
              />
            )}
          />
        )}
      </div>

      <WorkflowDialog
        kind={workflow}
        onClose={() => {
          setWorkflow(null);
          setLogContext({});
        }}
        prefillGkId={logContext.gkId}
        prefillMatchDate={logContext.date}
        followUpEventId={logContext.eventId}
      />
      {/* Correction opens the same form, prefilled, and updates the original row. */}
      <WorkflowDialog
        kind={editing ? "interaction" : null}
        editingInteraction={editing}
        onClose={() => setEditing(null)}
      />
      <DeleteInteractionDialog interaction={pendingDelete} onClose={() => setPendingDelete(null)} />
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
  );
}
