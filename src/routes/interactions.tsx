import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, Card, Pill, Avatar, EmptyState } from "@/components/primitives";
import { getGk, getMentor, formatRelative } from "@/lib/mock-data";
import { useInteractionsPage } from "@/lib/interactions/use-interactions";
import {
  formatDateOnly,
  INTERACTION_TYPES,
  INTERACTIONS_PAGE_SIZE,
  type InteractionTypeValue,
  type ListInteractionsQuery,
} from "@/lib/interactions/schema";
import { useEffect, useMemo, useState } from "react";
import { X, MessageSquarePlus, Filter, ChevronLeft, ChevronRight, Search } from "lucide-react";
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
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
});

export const Route = createFileRoute("/interactions")({
  validateSearch: zodValidator(interactionsSearchSchema),
  component: withPermission(InteractionsPage, "interactions.view"),
});

const TYPES = ["All", ...INTERACTION_TYPES] as const;
type TypeChip = (typeof TYPES)[number];

const PLANNED_TO_TYPE: Record<string, TypeChip> = {
  "Attend Live Match": "Live Match Observation",
  "Training Ground Visit": "Training Ground Visit",
  "Coffee Catch Up": "Coffee Catch Up",
};

function resolveType(param: string): TypeChip {
  if (!param) return "All";
  if ((TYPES as readonly string[]).includes(param)) return param as TypeChip;
  return PLANNED_TO_TYPE[param] ?? "All";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function InteractionsPage() {
  const { can } = useAuth();
  const navigate = useNavigate({ from: "/interactions" });
  const { from, to, mentorId, type: typeParam, source, q, page } = Route.useSearch();
  const navSource = getNavSource(source);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const type = resolveType(typeParam);

  // Debounced search box: the URL (and therefore the server query) only
  // updates once typing pauses, so each keystroke is not a round trip.
  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => setSearchDraft(q), [q]);
  useEffect(() => {
    if (searchDraft === q) return;
    const id = setTimeout(() => {
      navigate({ search: { from, to, mentorId, type: typeParam, source, q: searchDraft, page: 1 }, replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [searchDraft, q, navigate, from, to, mentorId, typeParam, source]);

  const mentorName = mentorId ? getMentor(mentorId)?.name ?? "" : "";
  const safePage = Math.max(1, page);

  // Every filter below is executed in Postgres — only one page is fetched.
  const query = useMemo<ListInteractionsQuery>(() => {
    const params: ListInteractionsQuery = { page: safePage, pageSize: INTERACTIONS_PAGE_SIZE };
    if (from) params.from = from.slice(0, 10);
    if (to) params.to = to.slice(0, 10);
    if (mentorId && UUID.test(mentorId)) params.mentorId = mentorId;
    else if (mentorName) params.mentorName = mentorName;
    if (type !== "All") params.interactionType = type as InteractionTypeValue;
    if (q) params.search = q;
    return params;
  }, [safePage, from, to, mentorId, mentorName, type, q]);

  const { data, isLoading, isError, isFetching } = useInteractionsPage(query);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;

  const hasFilters =
    Boolean(mentorId) || (Boolean(from) && Boolean(to)) || Boolean(typeParam) || Boolean(q);
  const clearSearch = { from: "", to: "", mentorId: "", type: "", source: "", q: "", page: 1 };

  const setType = (t: TypeChip) =>
    navigate({ search: { from, to, mentorId, source, q, type: t === "All" ? "" : t, page: 1 } });
  const goToPage = (next: number) =>
    navigate({
      search: {
        from,
        to,
        mentorId,
        source,
        q,
        type: typeParam,
        page: Math.min(Math.max(1, next), pageCount),
      },
    });

  const firstOnPage = total === 0 ? 0 : (safePage - 1) * INTERACTIONS_PAGE_SIZE + 1;
  const lastOnPage = Math.min(total, (safePage - 1) * INTERACTIONS_PAGE_SIZE + rows.length);

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
      <div className="flex flex-wrap items-center gap-1.5">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${type === t ? "bg-accent border-accent text-accent-foreground" : "border-border hover:bg-accent/40 text-muted-foreground"}`}>{t}</button>
        ))}
        <div className="relative ml-auto">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search goalkeeper or club"
            placeholder="Search goalkeeper or club"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="h-8 w-56 pl-8 pr-2 rounded-md border border-border bg-background text-xs"
          />
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider">Scoped to:</span>
          {mentorId && <Pill tone="muted">{getMentor(mentorId)?.name ?? mentorId}</Pill>}
          {q && <Pill tone="muted">“{q}”</Pill>}
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
            {(isLoading || isError) && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-muted-foreground">
                  {isLoading ? "Loading logged interactions…" : "Interactions could not be loaded. Please retry."}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-2">
                  <EmptyState
                    icon={hasFilters ? Filter : MessageSquarePlus}
                    title={hasFilters ? "No interactions match these filters" : "No interactions logged yet"}
                    description={
                      hasFilters
                        ? "Try broadening the date range, mentor, search or type filter to see more touchpoints."
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
            {rows.map((i) => {
              const gk = getGk(i.gkSlug);
              const name = gk?.name ?? i.goalkeeperName;
              const initials = gk?.initials ?? (i.goalkeeperName.slice(0, 1).toUpperCase() || "?");
              return (
                <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums font-mono">{formatDateOnly(i.occurredAt)}<div className="text-[10px] opacity-60">{formatRelative(`${i.occurredAt}T12:00:00`)}</div></td>
                  <td className="px-2"><Pill tone="info">{i.interactionType}</Pill></td>
                  <td className="px-2"><div className="flex items-center gap-2"><Avatar initials={initials} size={22} /><span className="font-medium">{name}</span>{i.club && <span className="text-[11px] text-muted-foreground">{i.club}</span>}</div></td>
                  <td className="px-2 text-muted-foreground">{i.mentorName || "—"}</td>
                  <td className="px-2 text-muted-foreground max-w-md"><span className="line-clamp-1">{i.notes}</span></td>
                  <td className="px-2"><Pill>{i.outcome || "—"}</Pill></td>
                  <td className="px-4 text-muted-foreground"><span className="line-clamp-1">{i.followUp || "—"}</span></td>
                </tr>
              );
            })}
          </tbody>

        </table>
        {!isError && total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span aria-live="polite">
              Showing {firstOnPage}–{lastOnPage} of {total}
              {isFetching ? " · updating…" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border disabled:opacity-40 hover:bg-accent/40"
              >
                <ChevronLeft className="size-3.5" /> Previous
              </button>
              <span className="tabular-nums">Page {safePage} of {pageCount}</span>
              <button
                type="button"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage >= pageCount}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border disabled:opacity-40 hover:bg-accent/40"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>
      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} />
    </div>
  );
}
