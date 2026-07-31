import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, Card, TierBadge, Avatar, TrafficLight, DutyBadge, StatCard, Pill } from "@/components/primitives";
import { goalkeepers, dutyStatusForGk, dutyOverview, DUTY_LABELS, type DutyLevel, type Status } from "@/lib/mock-data";
import { useMemo, useState } from "react";
import { withPermission } from "@/components/require-permission";
import { ChevronDown, ChevronUp, X } from "lucide-react";

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
  ratingMin: fallback(z.number(), 50).default(50),
  ratingMax: fallback(z.number(), 99).default(99),
  loan: fallback(z.string(), "any").default("any"),
});

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
const TIER_OPTIONS: Status[] = ["Tier 1", "Tier 2", "Tier 3", "Tier 4", "Academy", "Free Agent"];
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

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const toCsv = (arr: string[]) => arr.join(",");
const clampRating = (n: number) => Math.max(50, Math.min(99, Math.round(n)));

function GoalkeepersList() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/goalkeepers" });
  const [advOpen, setAdvOpen] = useState(false);

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

  const update = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }), replace: true });
  };

  const toggleFrom = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  // Filtering
  const now = Date.now();
  const MS_YEAR = 365 * 24 * 60 * 60 * 1000;
  const filtered = goalkeepers.filter((g) => {
    // Quick category chips
    if (search.cat === "UK Based" && g.region !== "UK Based") return false;
    if (search.cat === "Overseas" && g.region !== "Overseas") return false;
    if (search.cat === "Free Agents" && g.status !== "Free Agent") return false;
    if (search.cat === "Academy" && g.status !== "Academy") return false;
    if (search.cat === "Tier 1-2" && g.status !== "Tier 1" && g.status !== "Tier 2") return false;
    if (search.cat === "Tier 3-4" && g.status !== "Tier 3" && g.status !== "Tier 4") return false;

    if (search.duty !== "all" && dutyStatusForGk(g).level !== (search.duty as DutyLevel)) return false;

    if (search.q && !`${g.name} ${g.club} ${g.nationality} ${g.league}`.toLowerCase().includes(search.q.toLowerCase())) return false;

    // Advanced multi-selects
    if (selectedTiers.length && !selectedTiers.includes(g.status)) return false;
    if (selectedLeagues.length && !selectedLeagues.includes(g.league)) return false;
    if (selectedNats.length && !selectedNats.includes(g.nationality)) return false;

    // Club contains
    if (search.club) {
      const hay = `${g.club} ${g.parentClub ?? ""}`.toLowerCase();
      if (!hay.includes(search.club.toLowerCase())) return false;
    }

    // Loan status
    if (search.loan === "loan" && !g.onLoan) return false;
    if (search.loan === "permanent" && g.onLoan) return false;

    // Contract
    if (search.contract !== "any") {
      const iso = g.contractUntil;
      if (search.contract === "expired") {
        if (iso !== "—" && new Date(iso).getTime() > now) return false;
      } else if (search.contract === "expiring12") {
        if (iso === "—") return false;
        const t = new Date(iso).getTime();
        if (!(t >= now && t <= now + MS_YEAR)) return false;
      } else if (search.contract === "expiring24") {
        if (iso === "—") return false;
        const t = new Date(iso).getTime();
        if (!(t >= now && t <= now + 2 * MS_YEAR)) return false;
      } else if (/^\d{4}$/.test(search.contract)) {
        if (iso === "—" || iso.slice(0, 4) !== search.contract) return false;
      }
    }

    // Rating range
    if (g.rating < ratingMin || g.rating > ratingMax) return false;

    return true;
  });

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
    (ratingMin !== 50 || ratingMax !== 99 ? 1 : 0);

  const resetAll = () =>
    navigate({
      search: {
        q: "", cat: "All", duty: "all",
        tiers: "", leagues: "", nats: "", club: "",
        contract: "any", ratingMin: 50, ratingMax: 99, loan: "any",
      },
      replace: true,
    });

  return (
    <div className="space-y-5">
      <PageHeader title="Goalkeepers" description={`${goalkeepers.length} RPM clients under management across the UK and internationally.`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Under Care" value={dutyOverview.total} />
        <StatCard label="Up to date" value={dutyOverview.up_to_date} hint="Duty fulfilled" />
        <StatCard label="Due soon" value={dutyOverview.due_soon} hint="Approaching cadence" accent="warning" />
        <StatCard label="Overdue" value={dutyOverview.overdue} hint="Action required" accent="destructive" />
      </div>

      {/* Primary quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search name, club, league, nationality…"
          className="h-9 px-3 rounded-md bg-input/60 border border-border text-sm w-80"
          aria-label="Search goalkeepers"
        />
        <div className="flex flex-wrap rounded-md border border-border overflow-hidden text-xs">
          {CATS_LIST.map((t) => (
            <button key={t} onClick={() => update({ cat: t })} className={`px-3 py-1.5 transition-colors border-r border-border last:border-r-0 ${search.cat === t ? "bg-accent text-accent-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap rounded-md border border-border overflow-hidden text-xs">
          {DUTIES.map((d) => (
            <button key={d.id} onClick={() => update({ duty: d.id })} className={`px-3 py-1.5 inline-flex items-center gap-1.5 transition-colors border-r border-border last:border-r-0 ${search.duty === d.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/40 text-muted-foreground"}`}>
              {d.id !== "all" && <TrafficLight level={d.id as DutyLevel} size={7} />}
              {d.label}
              <span className="tabular-nums font-mono text-[10px] opacity-70">{d.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAdvOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-xs hover:bg-accent/40"
          aria-expanded={advOpen}
        >
          {advOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          Advanced filters
          {activeAdv > 0 && <Pill tone="info">{activeAdv}</Pill>}
        </button>
        <div className="text-xs text-muted-foreground tabular-nums font-mono">{filtered.length} results</div>
      </div>

      {/* Advanced filters panel */}
      {advOpen && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Tier */}
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Tier</div>
              <div className="flex flex-wrap gap-1.5">
                {TIER_OPTIONS.map((t) => {
                  const on = selectedTiers.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => update({ tiers: toCsv(toggleFrom(selectedTiers, t)) })}
                      className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${on ? "bg-primary/15 border-primary/50 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"}`}
                      aria-pressed={on}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Loan */}
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Loan status</div>
              <div className="flex flex-wrap gap-1.5">
                {LOAN_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => update({ loan: o.id })}
                    className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${search.loan === o.id ? "bg-primary/15 border-primary/50 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"}`}
                    aria-pressed={search.loan === o.id}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contract */}
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Contract</div>
              <select
                value={search.contract}
                onChange={(e) => update({ contract: e.target.value })}
                className="h-9 w-full px-2 rounded-md bg-input/60 border border-border text-sm"
                aria-label="Contract filter"
              >
                {CONTRACT_OPTIONS.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                <optgroup label="Expires in year">
                  {contractYears.map((y) => (<option key={y} value={y}>{y}</option>))}
                </optgroup>
              </select>
            </div>

            {/* Club */}
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Club or parent club</div>
              <input
                value={search.club}
                onChange={(e) => update({ club: e.target.value })}
                placeholder="e.g. Brighton, Wolves…"
                className="h-9 w-full px-2 rounded-md bg-input/60 border border-border text-sm"
                aria-label="Club filter"
              />
            </div>

            {/* League */}
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">League ({selectedLeagues.length || 0} selected)</div>
              <div className="max-h-32 overflow-y-auto rounded-md border border-border p-1.5 flex flex-wrap gap-1">
                {allLeagues.map((l) => {
                  const on = selectedLeagues.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => update({ leagues: toCsv(toggleFrom(selectedLeagues, l)) })}
                      className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${on ? "bg-primary/15 border-primary/50 text-foreground" : "border-border/60 text-muted-foreground hover:bg-accent/40"}`}
                      aria-pressed={on}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nationality */}
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Nationality ({selectedNats.length || 0} selected)</div>
              <div className="max-h-32 overflow-y-auto rounded-md border border-border p-1.5 flex flex-wrap gap-1">
                {allNats.map((n) => {
                  const on = selectedNats.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => update({ nats: toCsv(toggleFrom(selectedNats, n)) })}
                      className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${on ? "bg-primary/15 border-primary/50 text-foreground" : "border-border/60 text-muted-foreground hover:bg-accent/40"}`}
                      aria-pressed={on}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rating range */}
            <div className="md:col-span-2 lg:col-span-3">
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">
                Rating range <span className="tabular-nums font-mono text-foreground">{ratingMin}–{ratingMax}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground flex-1">
                  <span className="w-8 tabular-nums">Min</span>
                  <input
                    type="range" min={50} max={99} value={ratingMin}
                    onChange={(e) => update({ ratingMin: clampRating(Number(e.target.value)) })}
                    className="flex-1"
                    aria-label="Minimum rating"
                  />
                  <span className="w-6 tabular-nums font-mono text-foreground">{ratingMin}</span>
                </label>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground flex-1">
                  <span className="w-8 tabular-nums">Max</span>
                  <input
                    type="range" min={50} max={99} value={ratingMax}
                    onChange={(e) => update({ ratingMax: clampRating(Number(e.target.value)) })}
                    className="flex-1"
                    aria-label="Maximum rating"
                  />
                  <span className="w-6 tabular-nums font-mono text-foreground">{ratingMax}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border">
            <div className="text-[11px] text-muted-foreground">{activeAdv} advanced filter{activeAdv === 1 ? "" : "s"} active</div>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-[11px] hover:bg-accent/40"
            >
              <X className="size-3" /> Reset all filters
            </button>
          </div>
        </Card>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="font-medium px-3 py-2.5 w-6"></th>
              <th className="font-medium px-2 py-2.5">Goalkeeper</th>
              <th className="font-medium px-2 py-2.5">Status</th>
              <th className="font-medium px-2 py-2.5">Club</th>
              <th className="font-medium px-2 py-2.5">League</th>
              <th className="font-medium px-2 py-2.5">Age</th>
              <th className="font-medium px-2 py-2.5">Nationality</th>
              <th className="font-medium px-2 py-2.5">Contract</th>
              <th className="font-medium px-2 py-2.5">Duty of Care</th>
              <th className="font-medium px-4 py-2.5 text-right">Rating</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No goalkeepers match the current filters.{" "}
                  <button onClick={resetAll} className="text-primary hover:underline">Reset filters</button>
                </td>
              </tr>
            ) : filtered.map((gk) => {
              const d = dutyStatusForGk(gk);
              return (
                <tr key={gk.id} className="border-b border-border/60 last:border-0 hover:bg-accent/20 transition-colors">
                  <td className="pl-4 pr-1"><TrafficLight level={d.level} /></td>
                  <td className="px-2 py-2.5">
                    <Link to="/goalkeepers/$gkId" params={{ gkId: gk.id }} className="flex items-center gap-2.5">
                      <Avatar initials={gk.initials} size={28} imageUrl={gk.profileImage} alt={`${gk.name} portrait`} />
                      <span className="font-medium">{gk.name}</span>
                    </Link>
                  </td>
                  <td className="px-2"><TierBadge tier={gk.status} /></td>
                  <td className="px-2 text-muted-foreground">
                    <div className="flex flex-col">
                      <span>{gk.club || "Free Agent"}</span>
                      {gk.onLoan && gk.parentClub && (
                        <span className="text-[10px] text-muted-foreground/80 italic">on loan from {gk.parentClub}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 text-muted-foreground text-xs">{gk.league}</td>
                  <td className="px-2 tabular-nums font-mono">{gk.age}</td>
                  <td className="px-2 text-muted-foreground">{gk.nationality || "—"}</td>
                  <td className="px-2 text-muted-foreground tabular-nums font-mono">{gk.contractUntil === "—" ? "—" : gk.contractUntil.slice(0, 4)}</td>
                  <td className="px-2">
                    <DutyBadge level={d.level} label={d.label} />
                  </td>
                  <td className="px-4 text-right tabular-nums font-mono font-medium">{gk.rating}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
