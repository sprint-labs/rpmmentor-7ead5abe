import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, X } from "lucide-react";
import { PageHeader, Pill } from "@/components/primitives";
import { getMentor } from "@/lib/mock-data";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
import {
  DASHBOARD_INTERACTION_TYPES,
  isDashboardInteractionType,
  type LoggedInteraction,
} from "@/lib/interactions/schema";
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
  /** Mentor chosen in the list's mentor filter (by name), kept for Back. */
  mentor: fallback(z.string(), "").default(""),
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
    mentor: mentorFilter,
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

  const { data, isError } = useLoggedInteractions();
  // The query stays disabled (not "loading") until the browser session is
  // confirmed, so "no data yet" is what counts as loading. Otherwise a hard
  // refresh flashes an empty or "not found" state first.
  const isLoading = data === undefined && !isError;

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

  const touchpointCount = useMemo(
    () => rows.filter((i) => isDashboardInteractionType(i.interactionType)).length,
    [rows],
  );

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
  const initialFilters = useMemo(() => {
    const seeds: Record<string, string> = {};
    if (initialType) seeds.type = initialType;
    if (mentorFilter) seeds.mentor = mentorFilter;
    return seeds;
  }, [initialType, mentorFilter]);

  // The list's search and filters live in the URL, so opening a record on a
  // phone and pressing Back returns to the same filtered list. Typing is
  // debounced so each keystroke is not a history write.
  type FilterState = { search: string; filters: Record<string, string> };
  const filterSync = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFilters = useRef<FilterState | null>(null);
  useEffect(
    () => () => {
      if (filterSync.current) clearTimeout(filterSync.current);
    },
    [],
  );
  const writeFilters = ({ search: text, filters }: FilterState) =>
    navigate({
      search: (prev) => ({
        ...prev,
        q: text,
        type: filters.type ?? "",
        mentor: filters.mentor ?? "",
      }),
      replace: true,
    });
  const persistFilters = (state: FilterState) => {
    if (filterSync.current) clearTimeout(filterSync.current);
    pendingFilters.current = state;
    filterSync.current = setTimeout(() => {
      filterSync.current = null;
      pendingFilters.current = null;
      void writeFilters(state);
    }, 300);
  };
  /** Write any still-debounced filter change now, before leaving the list. */
  const flushFilters = async () => {
    if (!filterSync.current || !pendingFilters.current) return;
    clearTimeout(filterSync.current);
    filterSync.current = null;
    const state = pendingFilters.current;
    pendingFilters.current = null;
    await writeFilters(state);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={
          navSource ? [{ label: "Dashboard", to: "/" }, { label: navSource.label }] : undefined
        }
        title="Interactions"
        description={
          isLoading
            ? "Loading interactions…"
            : `${touchpointCount} interaction${touchpointCount === 1 ? "" : "s"} · ${
                hasPeriod ? periodLabel : "all time"
              } · newest first`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label>
              <span className="sr-only">Period</span>
              <select
                value={preset}
                onChange={(event) => setPeriod(event.target.value)}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
              >
                <NotebookPen className="size-3.5" aria-hidden="true" /> Log Interaction
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

      <div>
        {isLoading ? (
          <Empty label="Loading…" />
        ) : isError ? (
          <Empty label="Interactions could not be loaded. Please refresh." />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card pb-8 text-center">
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
                search={{ from: "", to: "", mentorId: "", type: "", source: "", q: "", mentor: "" }}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-accent/40"
              >
                <X className="size-3.5" /> Show all interactions
              </Link>
            )}
          </div>
        ) : (
          <InteractionWorkbench
            variant="page"
            interactions={rows}
            periodLabel={periodLabel}
            scopeLabel={mentorScopeName || undefined}
            initialFilters={initialFilters}
            initialSearch={q}
            onFiltersChange={persistFilters}
            onOpenCompact={async (interaction) => {
              await flushFilters();
              await navigate({
                to: "/interactions/$interactionId",
                params: { interactionId: interaction.id },
              });
            }}
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
    <div className="rounded-lg py-10 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
  );
}
