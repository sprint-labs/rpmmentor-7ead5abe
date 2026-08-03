import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, Card, TierBadge, Avatar, TrafficLight, DutyBadge, Pill } from "@/components/primitives";
import { goalkeepers, dutyStatusForGk, dutyOverview, DUTY_LABELS, type DutyLevel, type Goalkeeper, type TierLevelLabel } from "@/lib/mock-data";
import { listMatchReports } from "@/lib/match-reports/reports.functions";
import { canonicaliseLegacyTierCategory, clampRating, clearGoalkeeperFilters, countActiveGoalkeeperFilters, csv, filterGoalkeepers, normaliseGoalkeeperName, toCsv, toggleFrom, type GoalkeeperFilterState } from "@/lib/goalkeeper-filters";
import { useEffect, useMemo, useState } from "react";
import { withPermission } from "@/components/require-permission";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronDown, ChevronUp, ChevronsUpDown, SlidersHorizontal, X } from "lucide-react";

// ---------- URL search-param schema ----------
// Values are stored as CSV strings for multi-selects to keep URLs short and
// tolerant of unknown values; validation happens in the component.
const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cat: fallback(z.string(), "All").default("All"),
  duty: fallback(z.string(), "all").default("all"),
  tiers: fallback(z.string(), "").default(""),
  leagues: fallback(z.string(), "").default(""),
  nats: fallback(z.string(), "").default(""),
  club: fallback(z.string(), "").default(""),
  contract: fallback(z.string(), "any").default("any"),
  ratingMin: fallback(z.number(), 1).default(1),
  ratingMax: fallback(z.number(), 5).default(5),
  loan: fallback(z.string(), "any").default("any"),
});

type GoalkeeperSearch = GoalkeeperFilterState;
type UpdateGoalkeeperSearch = (patch: Partial<GoalkeeperSearch>) => void;

export const Route = createFileRoute("/goalkeepers")({
  validateSearch: zodValidator(searchSchema),
  component: withPermission(GoalkeepersLayout, "goalkeepers.view"),
});

function GoalkeepersLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isDetail = path !== "/goalkeepers";
  if (isDetail) return <Outlet />;
  return <GoalkeepersList />;
}

const CATS = ["All", "UK Based", "Overseas", "Academy", "Tier 1-2", "Tier 3-4", "Free Agents"] as const;
const TIER_OPTIONS: TierLevelLabel[] = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];
const CONTRACT_OPTIONS: { id: string; label: string }[] = [
  { id: "any", label: "Any contract" },
  { id: "expired", label: "Expired / free agent" },
  { id: "expiring12", label: "Expiring ≤ 12 months" },
  { id: "expiring24", label: "Expiring ≤ 24 months" },
];
const LOAN_OPTIONS: { id: string; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "loan", label: "On loan" },
  { id: "permanent", label: "Permanent" },
];

function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
}

type SortKey = "goalkeeper" | "tier" | "tags" | "club" | "league" | "age" | "nationality" | "contract" | "duty" | "rating";
type SortDirection = "asc" | "desc";
type Sort = { key: SortKey; direction: SortDirection };

const MOBILE_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "goalkeeper", label: "Goalkeeper" },
  { key: "tier", label: "Tier" },
  { key: "club", label: "Club" },
  { key: "age", label: "Age" },
  { key: "contract", label: "Contract expiry" },
  { key: "rating", label: "Rating" },
];

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function formatContractExpiry(value: string): string {
  if (value === "—") return "-";
  const match = value.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return "-";
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function contractTimestamp(value: string): number | null {
  if (value === "—") return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareNullable(a: string | number | null, b: string | number | null, direction: SortDirection) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const comparison = typeof a === "string" && typeof b === "string"
    ? collator.compare(a, b)
    : Number(a) - Number(b);
  return direction === "asc" ? comparison : -comparison;
}

function tagsLabel(gk: Goalkeeper): string | null {
  return gk.tags.length ? gk.tags.join(", ") : null;
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const direction = sort?.key === sortKey ? sort.direction : null;
  return (
    <th
      className={`font-medium px-2 py-2.5 ${className}`}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        title={`Sort by ${label}${direction ? ` (${direction === "asc" ? "ascending" : "descending"})` : ""}`}
      >
        {label}
        {direction === "asc" ? <ChevronUp className="size-3" aria-hidden="true" />
          : direction === "desc" ? <ChevronDown className="size-3" aria-hidden="true" />
            : <ChevronsUpDown className="size-3 opacity-55" aria-hidden="true" />}
      </button>
    </th>
  );
}

function MobileGoalkeeperCard({
  gk,
  rating,
}: {
  gk: Goalkeeper;
  rating: { average: number; reportCount: number } | undefined;
}) {
  const duty = dutyStatusForGk(gk);
  const club = gk.tags.includes("Free Agent") ? "Free Agent" : gk.club || "Not recorded";
  const league = gk.tags.includes("Free Agent") ? "—" : gk.league || "Not recorded";

  return (
    <article className="p-4">
      <div className="flex items-start gap-3">
        <TrafficLight level={duty.level} />
        <Link to="/goalkeepers/$gkId" params={{ gkId: gk.id }} className="flex min-w-0 flex-1 items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar initials={gk.initials} size={36} imageUrl={gk.profileImage} alt={`${gk.name} portrait`} />
          <span className="min-w-0">
            <span className="block truncate text-base font-medium">{gk.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{club}</span>
          </span>
        </Link>
        <TierBadge tier={gk.tier} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {gk.tags.map((tag) => <TierBadge key={tag} tier={tag} />)}
        {gk.onLoan && <Pill tone="info">On loan{gk.parentClub ? ` from ${gk.parentClub}` : ""}</Pill>}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div className="min-w-0">
          <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">League</dt>
          <dd className="mt-0.5 truncate text-sm text-foreground">{league}</dd>
        </div>
        <div className="min-w-0">
          <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">Nationality</dt>
          <dd className="mt-0.5 truncate text-sm text-foreground">{gk.nationality || "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">Contract expiry</dt>
          <dd className="mt-0.5 text-sm text-foreground">{formatContractExpiry(gk.contractUntil)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider text-[10px] text-muted-foreground">Rating</dt>
          <dd className="mt-0.5 font-mono text-sm font-medium text-foreground" title={rating ? `Average of ${rating.reportCount} valid Match Report score${rating.reportCount === 1 ? "" : "s"}` : "No valid Match Report score recorded"}>
            {rating ? `${rating.average.toFixed(1)}/5` : "-"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <DutyBadge level={duty.level} label={duty.label} />
        <Link to="/goalkeepers/$gkId" params={{ gkId: gk.id }} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Open profile →
        </Link>
      </div>
    </article>
  );
}

function TierFilterOptions({ selectedTiers, update, showLabel = true }: {
  selectedTiers: string[];
  update: UpdateGoalkeeperSearch;
  showLabel?: boolean;
}) {
  return (
    <div>
      {showLabel && <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Tier</div>}
      <div className="flex flex-wrap gap-1.5">
        {TIER_OPTIONS.map((tier) => {
          const selected = selectedTiers.includes(tier);
          return (
            <button key={tier} type="button" onClick={() => update({ tiers: toCsv(toggleFrom(selectedTiers, tier)) })} className={`min-h-10 rounded-md border px-2 text-[11px] transition-colors sm:min-h-0 sm:py-1 ${selected ? "bg-primary/15 border-primary/50 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"}`} aria-pressed={selected}>
              {tier}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AdvancedFilterFields({
  includeTier, search, update, selectedTiers, selectedLeagues, selectedNats, allLeagues, allNats, contractYears, ratingMin, ratingMax,
}: {
  includeTier: boolean;
  search: GoalkeeperSearch;
  update: UpdateGoalkeeperSearch;
  selectedTiers: string[];
  selectedLeagues: string[];
  selectedNats: string[];
  allLeagues: string[];
  allNats: string[];
  contractYears: string[];
  ratingMin: number;
  ratingMax: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {includeTier && <TierFilterOptions selectedTiers={selectedTiers} update={update} />}

      <div>
        <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Loan status</div>
        <div className="flex flex-wrap gap-1.5">
          {LOAN_OPTIONS.map((option) => (
            <button key={option.id} type="button" onClick={() => update({ loan: option.id })} className={`min-h-10 rounded-md border px-2 text-[11px] transition-colors sm:min-h-0 sm:py-1 ${search.loan === option.id ? "bg-primary/15 border-primary/50 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"}`} aria-pressed={search.loan === option.id}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Contract</div>
        <select value={search.contract} onChange={(event) => update({ contract: event.target.value })} className="h-11 w-full rounded-md border border-border bg-input/60 px-2 text-sm sm:h-9" aria-label="Contract filter">
          {CONTRACT_OPTIONS.map((option) => (<option key={option.id} value={option.id}>{option.label}</option>))}
          <optgroup label="Expires in year">
            {contractYears.map((year) => (<option key={year} value={year}>{year}</option>))}
          </optgroup>
        </select>
      </div>

      <div>
        <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Club or parent club</div>
        <input value={search.club} onChange={(event) => update({ club: event.target.value })} placeholder="e.g. Brighton, Wolves…" className="h-11 w-full rounded-md border border-border bg-input/60 px-2 text-sm sm:h-9" aria-label="Club filter" />
      </div>

      <div>
        <div className="text-[11px] uppercase text-muted-foreground mb-1.5">League ({selectedLeagues.length} selected)</div>
        <div className="max-h-32 overflow-y-auto rounded-md border border-border p-1.5 flex flex-wrap gap-1">
          {allLeagues.map((league) => {
            const selected = selectedLeagues.includes(league);
            return <button key={league} type="button" onClick={() => update({ leagues: toCsv(toggleFrom(selectedLeagues, league)) })} className={`min-h-8 rounded border px-2 text-[10px] transition-colors sm:min-h-0 sm:py-0.5 ${selected ? "bg-primary/15 border-primary/50 text-foreground" : "border-border/60 text-muted-foreground hover:bg-accent/40"}`} aria-pressed={selected}>{league}</button>;
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Nationality ({selectedNats.length} selected)</div>
        <div className="max-h-32 overflow-y-auto rounded-md border border-border p-1.5 flex flex-wrap gap-1">
          {allNats.map((nationality) => {
            const selected = selectedNats.includes(nationality);
            return <button key={nationality} type="button" onClick={() => update({ nats: toCsv(toggleFrom(selectedNats, nationality)) })} className={`min-h-8 rounded border px-2 text-[10px] transition-colors sm:min-h-0 sm:py-0.5 ${selected ? "bg-primary/15 border-primary/50 text-foreground" : "border-border/60 text-muted-foreground hover:bg-accent/40"}`} aria-pressed={selected}>{nationality}</button>;
          })}
        </div>
      </div>

      <div className="md:col-span-2 lg:col-span-3">
        <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Rating range <span className="tabular-nums font-mono text-foreground">{ratingMin.toFixed(1)}–{ratingMax.toFixed(1)}</span></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-8 tabular-nums">Min</span>
            <input type="range" min={1} max={5} step={0.1} value={ratingMin} onChange={(event) => update({ ratingMin: clampRating(Number(event.target.value)) })} className="flex-1" aria-label="Minimum rating" />
            <span className="w-8 tabular-nums font-mono text-foreground">{ratingMin.toFixed(1)}</span>
          </label>
          <label className="flex flex-1 items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-8 tabular-nums">Max</span>
            <input type="range" min={1} max={5} step={0.1} value={ratingMax} onChange={(event) => update({ ratingMax: clampRating(Number(event.target.value)) })} className="flex-1" aria-label="Maximum rating" />
            <span className="w-8 tabular-nums font-mono text-foreground">{ratingMax.toFixed(1)}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function GoalkeepersList() {
  const search = Route.useSearch() as GoalkeeperSearch;
  const navigate = useNavigate({ from: "/goalkeepers" });
  const isMobile = useIsMobile();
  const [advOpen, setAdvOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileAdvOpen, setMobileAdvOpen] = useState(false);
  const [sort, setSort] = useState<Sort | null>(null);
  const listFn = useServerFn(listMatchReports);
  const { data: reportsData, isError: reportsUnavailable } = useQuery({
    queryKey: ["match-reports"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  // Distinct dropdown options derived from the live roster.
  const { allLeagues, allNats, contractYears } = useMemo(() => {
    const leagues = new Set<string>();
    const nats = new Set<string>();
    const years = new Set<string>();
    for (const g of goalkeepers) {
      if (g.league) leagues.add(g.league);
      if (g.nationality) nats.add(g.nationality);
      if (g.contractUntil && g.contractUntil !== "—") years.add(g.contractUntil.slice(0, 4));
    }
    return {
      allLeagues: [...leagues].sort(),
      allNats: [...nats].sort(),
      contractYears: [...years].sort(),
    };
  }, []);

  const selectedTiers = csv(search.tiers);
  const selectedLeagues = csv(search.leagues);
  const selectedNats = csv(search.nats);
  const ratingMin = clampRating(search.ratingMin);
  const ratingMax = clampRating(Math.max(search.ratingMax, ratingMin));
  const ratingFilterActive = ratingMin !== 1 || ratingMax !== 5;

  const ratingsByGoalkeeper = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const report of reportsData?.reports ?? []) {
      if (!isValidScore(report.average)) continue;
      const key = normaliseGoalkeeperName(report.goalkeeper);
      const existing = totals.get(key) ?? { total: 0, count: 0 };
      existing.total += report.average;
      existing.count += 1;
      totals.set(key, existing);
    }

    return new Map(
      [...totals].map(([name, { total, count }]) => [name, {
        average: Math.round((total / count) * 10) / 10,
        reportCount: count,
      }]),
    );
  }, [reportsData]);

  const update = (patch: Partial<GoalkeeperSearch>) => {
    navigate({ search: (prev: GoalkeeperSearch) => ({ ...prev, ...patch }), replace: true, resetScroll: false });
  };

  useEffect(() => {
    if (!isMobile) return;

    const canonicalFilters = canonicaliseLegacyTierCategory(search);
    if (!canonicalFilters) return;

    navigate({ search: canonicalFilters, replace: true, resetScroll: false });
  }, [isMobile, navigate, search]);

  const toggleSort = (key: SortKey) => {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  };

  const filtered = filterGoalkeepers(goalkeepers, search, ratingsByGoalkeeper);

  const sorted = useMemo(() => {
    if (!sort) return filtered;

    return [...filtered].sort((a, b) => {
      const aRating = ratingsByGoalkeeper.get(normaliseGoalkeeperName(a.name))?.average ?? null;
      const bRating = ratingsByGoalkeeper.get(normaliseGoalkeeperName(b.name))?.average ?? null;
      const aDuty = dutyStatusForGk(a).label;
      const bDuty = dutyStatusForGk(b).label;

      switch (sort.key) {
        case "goalkeeper": return compareNullable(a.name, b.name, sort.direction);
        case "tier": return compareNullable(a.tierLevel, b.tierLevel, sort.direction);
        case "tags": return compareNullable(tagsLabel(a), tagsLabel(b), sort.direction);
        case "club": return compareNullable(a.club === "Free Agent" ? null : a.club, b.club === "Free Agent" ? null : b.club, sort.direction);
        case "league": return compareNullable(a.league === "Free Agent" ? null : a.league, b.league === "Free Agent" ? null : b.league, sort.direction);
        case "age": return compareNullable(a.age, b.age, sort.direction);
        case "nationality": return compareNullable(a.nationality || null, b.nationality || null, sort.direction);
        case "contract": return compareNullable(contractTimestamp(a.contractUntil), contractTimestamp(b.contractUntil), sort.direction);
        case "duty": return compareNullable(aDuty, bDuty, sort.direction);
        case "rating": return compareNullable(aRating, bRating, sort.direction);
      }
    });
  }, [filtered, ratingsByGoalkeeper, sort]);

  const CATS_LIST = CATS;
  const DUTIES: { id: "all" | DutyLevel; label: string; count: number }[] = [
    { id: "all", label: "All", count: dutyOverview.total },
    { id: "up_to_date", label: DUTY_LABELS.up_to_date, count: dutyOverview.up_to_date },
    { id: "due_soon", label: DUTY_LABELS.due_soon, count: dutyOverview.due_soon },
    { id: "overdue", label: DUTY_LABELS.overdue, count: dutyOverview.overdue },
    { id: "not_required", label: DUTY_LABELS.not_required, count: dutyOverview.not_required },
    { id: "not_enough_data", label: DUTY_LABELS.not_enough_data, count: dutyOverview.not_enough_data },
  ];

  // Count active advanced filters for badge
  const activeAdv =
    selectedTiers.length + selectedLeagues.length + selectedNats.length +
    (search.club ? 1 : 0) +
    (search.contract !== "any" ? 1 : 0) +
    (search.loan !== "any" ? 1 : 0) +
    (ratingFilterActive ? 1 : 0);
  const activeFilters = countActiveGoalkeeperFilters(search);
  const legacyTierCategory =
    search.cat === "Tier 1-2" || search.cat === "Tier 3-4" ? search.cat : null;
  const hasLegacyTierConflict =
    isMobile && legacyTierCategory !== null && canonicaliseLegacyTierCategory(search) === null;

  const resetAll = () =>
    navigate({
      search: {
        q: "", cat: "All", duty: "all",
        tiers: "", leagues: "", nats: "", club: "",
        contract: "any", ratingMin: 1, ratingMax: 5, loan: "any",
      },
      replace: true,
    });

  const clearFilters = () => update(clearGoalkeeperFilters(search));

  return (
    <div className="space-y-5">
      <PageHeader title="Goalkeepers" description={`${goalkeepers.length} RPM clients under management across the UK and internationally.`} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search name, club, league, nationality…"
          className="h-11 w-full rounded-md border border-border bg-input/60 px-3 text-sm sm:h-9 sm:w-80"
          aria-label="Search goalkeepers"
        />
        <div className="flex w-full items-center justify-between gap-2 md:hidden">
          <Drawer open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <DrawerTrigger asChild>
              <button type="button" className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent/40" aria-label={activeFilters ? `Filters, ${activeFilters} active` : "Filters"}>
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Filters{activeFilters ? ` (${activeFilters})` : ""}
              </button>
            </DrawerTrigger>
            <DrawerContent className="h-[calc(100dvh-1rem)] max-h-[42rem]">
              <DrawerHeader>
                <div className="flex items-center justify-between gap-3">
                  <DrawerTitle>Filters</DrawerTitle>
                  <DrawerClose asChild><button type="button" className="size-11 rounded-md border border-border text-sm hover:bg-accent/40" aria-label="Close filters"><X className="mx-auto size-4" aria-hidden="true" /></button></DrawerClose>
                </div>
                <DrawerDescription>Refine the goalkeeper list without changing your search.</DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
                <div className="space-y-5">
                  {hasLegacyTierConflict && (
                    <section
                      className="rounded-md border border-border p-3"
                      aria-labelledby="mobile-legacy-tier-filter"
                    >
                      <h2
                        id="mobile-legacy-tier-filter"
                        className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        Legacy tier filter
                      </h2>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        This older link combines {legacyTierCategory} with an incompatible
                        individual tier selection.
                      </p>
                      <button
                        type="button"
                        onClick={() => update({ cat: "All" })}
                        className="mt-3 min-h-11 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent/40"
                      >
                        Remove grouped tier filter
                      </button>
                    </section>
                  )}
                  <section aria-labelledby="mobile-primary-filters">
                    <h2 id="mobile-primary-filters" className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Primary filters</h2>
                    <div className="flex flex-wrap gap-2">
                      {CATS_LIST.filter((category) => category !== "Tier 1-2" && category !== "Tier 3-4").map((category) => {
                        const selected = search.cat === category;
                        return <button key={category} type="button" onClick={() => update({ cat: category })} className={`min-h-11 rounded-md border px-3 text-sm transition-colors ${selected ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"}`} aria-pressed={selected}>{category}</button>;
                      })}
                    </div>
                  </section>

                  <section aria-labelledby="mobile-tier-filters">
                    <h2 id="mobile-tier-filters" className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tier</h2>
                    <TierFilterOptions selectedTiers={selectedTiers} update={update} showLabel={false} />
                  </section>

                  <section aria-labelledby="mobile-duty-filters">
                    <h2 id="mobile-duty-filters" className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Duty of care status</h2>
                    <div className="flex flex-wrap gap-2">
                      {DUTIES.map((duty) => {
                        const selected = search.duty === duty.id;
                        return <button key={duty.id} type="button" onClick={() => update({ duty: duty.id })} className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${selected ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"}`} aria-pressed={selected}>{duty.id !== "all" && <TrafficLight level={duty.id as DutyLevel} size={7} />}{duty.label}<span className="tabular-nums font-mono text-[10px] opacity-70">{duty.count}</span></button>;
                      })}
                    </div>
                  </section>

                  <section className="border-t border-border pt-4">
                    <button type="button" onClick={() => setMobileAdvOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between rounded-md border border-border px-3 text-sm font-medium hover:bg-accent/40" aria-expanded={mobileAdvOpen} aria-controls="mobile-advanced-filters">
                      <span>Advanced filters{activeAdv ? ` (${activeAdv})` : ""}</span>
                      {mobileAdvOpen ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                    </button>
                    {mobileAdvOpen && <div id="mobile-advanced-filters" className="pt-4"><AdvancedFilterFields includeTier={false} search={search} update={update} selectedTiers={selectedTiers} selectedLeagues={selectedLeagues} selectedNats={selectedNats} allLeagues={allLeagues} allNats={allNats} contractYears={contractYears} ratingMin={ratingMin} ratingMax={ratingMax} /></div>}
                  </section>
                </div>
              </div>
              <DrawerFooter className="border-t border-border">
                <button type="button" onClick={clearFilters} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent/40"><X className="size-4" aria-hidden="true" /> Clear filters</button>
                <DrawerClose asChild><button type="button" className="h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Apply filters</button></DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          <div className="font-mono text-xs tabular-nums text-muted-foreground">{filtered.length} results</div>
        </div>

        <div className="hidden w-full items-center gap-2 md:flex md:flex-wrap">
          <div className="flex flex-wrap overflow-hidden rounded-md border border-border text-xs">
            {CATS_LIST.map((category) => <button key={category} type="button" onClick={() => update({ cat: category })} className={`min-h-9 border-r border-border px-3 transition-colors last:border-r-0 ${search.cat === category ? "bg-accent text-accent-foreground" : "hover:bg-accent/40 text-muted-foreground"}`} aria-pressed={search.cat === category}>{category}</button>)}
          </div>
          <div className="flex flex-wrap overflow-hidden rounded-md border border-border text-xs">
            {DUTIES.map((duty) => <button key={duty.id} type="button" onClick={() => update({ duty: duty.id })} className={`inline-flex min-h-9 items-center gap-1.5 border-r border-border px-3 transition-colors last:border-r-0 ${search.duty === duty.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/40 text-muted-foreground"}`} aria-pressed={search.duty === duty.id}>{duty.id !== "all" && <TrafficLight level={duty.id as DutyLevel} size={7} />}{duty.label}<span className="tabular-nums font-mono text-[10px] opacity-70">{duty.count}</span></button>)}
          </div>
          <button type="button" onClick={() => setAdvOpen((open) => !open)} className="ml-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-accent/40" aria-expanded={advOpen} aria-controls="desktop-advanced-filters">
            {advOpen ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
            Advanced filters
            {activeAdv > 0 && <Pill tone="info">{activeAdv}</Pill>}
          </button>
          <div className="font-mono text-xs tabular-nums text-muted-foreground">{filtered.length} results</div>
        </div>
      </div>

      {advOpen && (
        <div id="desktop-advanced-filters" className="hidden md:block">
          <Card className="p-4 space-y-4">
            <AdvancedFilterFields includeTier search={search} update={update} selectedTiers={selectedTiers} selectedLeagues={selectedLeagues} selectedNats={selectedNats} allLeagues={allLeagues} allNats={allNats} contractYears={contractYears} ratingMin={ratingMin} ratingMax={ratingMax} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-1">
              <div className="text-[11px] text-muted-foreground">{activeAdv} advanced filter{activeAdv === 1 ? "" : "s"} active</div>
              <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] hover:bg-accent/40"><X className="size-3" aria-hidden="true" /> Clear filters</button>
            </div>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 md:hidden">
        <label className="text-xs text-muted-foreground" htmlFor="goalkeeper-mobile-sort">Sort by</label>
        <div className="flex flex-1 justify-end gap-2">
          <select
            id="goalkeeper-mobile-sort"
            value={sort?.key ?? ""}
            onChange={(event) => setSort(event.target.value ? { key: event.target.value as SortKey, direction: "asc" } : null)}
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-input/60 px-2 text-sm"
          >
            <option value="">Default order</option>
            {MOBILE_SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => sort && setSort({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" })}
            disabled={!sort}
            className="h-11 min-w-11 rounded-md border border-border px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={sort ? `Sort ${sort.direction === "asc" ? "descending" : "ascending"}` : "Choose a field to sort"}
          >
            {sort?.direction === "desc" ? "↓" : "↑"}
          </button>
        </div>
      </div>

      <Card className="divide-y divide-border md:hidden">
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No goalkeepers match the current filters. {" "}
            <button onClick={resetAll} className="text-primary hover:underline">Clear search and filters</button>
          </div>
        ) : sorted.map((gk) => (
          <MobileGoalkeeperCard
            key={gk.id}
            gk={gk}
            rating={ratingsByGoalkeeper.get(normaliseGoalkeeperName(gk.name))}
          />
        ))}
      </Card>

      <Card className="hidden overflow-x-auto md:block">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="font-medium px-3 py-2.5 w-6"></th>
              <SortableHeader label="Goalkeeper" sortKey="goalkeeper" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Tier" sortKey="tier" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Tags" sortKey="tags" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Club" sortKey="club" sort={sort} onSort={toggleSort} />
              <SortableHeader label="League" sortKey="league" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Age" sortKey="age" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Nationality" sortKey="nationality" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Contract Expiry" sortKey="contract" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Duty of Care" sortKey="duty" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Rating" sortKey="rating" sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No goalkeepers match the current filters.{" "}
                  <button onClick={resetAll} className="text-primary hover:underline">Clear search and filters</button>
                </td>
              </tr>
            ) : sorted.map((gk) => {
              const d = dutyStatusForGk(gk);
              const rating = ratingsByGoalkeeper.get(normaliseGoalkeeperName(gk.name));
              return (
                <tr key={gk.id} className="border-b border-border/60 last:border-0 hover:bg-accent/20 transition-colors">
                  <td className="pl-4 pr-1"><TrafficLight level={d.level} /></td>
                  <td className="px-2 py-2.5">
                    <Link to="/goalkeepers/$gkId" params={{ gkId: gk.id }} className="flex items-center gap-2.5">
                      <Avatar initials={gk.initials} size={28} imageUrl={gk.profileImage} alt={`${gk.name} portrait`} />
                      <span className="font-medium">{gk.name}</span>
                    </Link>
                  </td>
                  <td className="px-2"><TierBadge tier={gk.tier} /></td>
                  <td className="px-2">
                    {gk.tags.length ? (
                      <div className="flex flex-wrap gap-1">
                        {gk.tags.map((tag) => <TierBadge key={tag} tier={tag} />)}
                      </div>
                    ) : "-"}
                  </td>
                  <td className="px-2 text-muted-foreground">
                    <div className="flex flex-col">
                      <span>{gk.tags.includes("Free Agent") ? "-" : gk.club || "-"}</span>
                      {gk.onLoan && gk.parentClub && (
                        <span className="text-[10px] text-muted-foreground/80 italic">on loan from {gk.parentClub}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 text-muted-foreground text-xs">{gk.tags.includes("Free Agent") ? "-" : gk.league || "-"}</td>
                  <td className="px-2 tabular-nums font-mono">{gk.age}</td>
                  <td className="px-2 text-muted-foreground">{gk.nationality || "—"}</td>
                  <td className="px-2 text-muted-foreground">{formatContractExpiry(gk.contractUntil)}</td>
                  <td className="px-2">
                    <DutyBadge level={d.level} label={d.label} />
                  </td>
                  <td
                    className="px-4 text-right tabular-nums font-mono font-medium"
                    title={rating
                      ? `Average of ${rating.reportCount} valid Match Report score${rating.reportCount === 1 ? "" : "s"}`
                      : reportsUnavailable
                        ? "Match Report scores are unavailable"
                        : "No valid Match Report score recorded"}
                  >
                    {rating ? `${rating.average.toFixed(1)}/5` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
