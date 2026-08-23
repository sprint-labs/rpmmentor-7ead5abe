import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, TierBadge, Avatar, Pill, SectionTitle, ProgressBar } from "@/components/primitives";
import { goalkeepers, formatDate, formatRelative, type Tier } from "@/lib/mock-data";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { ArrowLeft, Info, Video, FileText, Phone, Eye, Users as UsersIcon, Calendar as CalendarIcon, Upload, ExternalLink } from "lucide-react";
import { listMatchReports } from "@/lib/match-reports/reports.functions";
import { PILLAR_IDS, PILLAR_LABELS, type MatchReportRow, type PillarId } from "@/lib/match-reports/schema";
import { ReportPreviewModal } from "@/components/report-preview-modal";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { useAuth } from "@/lib/auth";
import { listMedia, openAsset, formatBytes, type MediaAsset } from "@/lib/media-store";
import { UpdateClubButton } from "@/components/update-club-dialog";
import { listPlayers } from "@/lib/players.functions";
import { findPlayerByName, interactionBelongsToGoalkeeper } from "@/lib/goalkeeper-player-link";
import { compareInteractionsByAlertThenDate, interactionOutcomeAlertRank } from "@/lib/interaction-alert-rank";

/** Inclusive 1–5 finite numeric guard for report scores/averages. */
function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
}

export const Route = createFileRoute("/goalkeepers/$gkId")({
  loader: ({ params }) => {
    const gk = goalkeepers.find((g) => g.id === params.gkId);
    if (!gk) throw notFound();
    return { gk };
  },
  component: GkDetail,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">Goalkeeper not found.</div>,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
});

const TYPE_ICON: Record<string, typeof Video> = {
  "Live Match Observation": Eye, "Training Ground Visit": UsersIcon,
  "Coffee Catch Up": UsersIcon, "Phone Call": Phone,
};

function normaliseName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}


function formatDob(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Not recorded";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function reelLabel(url: string, index: number): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const slug = path.split("/").filter(Boolean).pop() ?? "";
    if (!slug || slug === "highlights") return index === 0 ? "Main highlight reel" : `Clip ${index + 1}`;
    return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return index === 0 ? "Main highlight reel" : `Clip ${index + 1}`;
  }
}

function formatContractExpiry(value: string): string {
  if (value === "—") return "-";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not recorded";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Sort match-report dates newest-first; undated reports sink to the bottom. */
function compareMatchDatesNewestFirst(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

function GkDetail() {
  const { gk } = Route.useLoaderData();
  const { can, user } = useAuth();
  const { data: loggedInteractions } = useLoggedInteractions();
  const listPlayersFn = useServerFn(listPlayers);
  const { data: players } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  const linkedPlayer = useMemo(
    () => findPlayerByName(players, gk.name),
    [players, gk.name],
  );
  const linkedPlayerId = linkedPlayer?.id ?? (gk as { playerId?: string | null }).playerId ?? null;
  const mediaGoalkeeperIds = useMemo(
    () => Array.from(new Set([gk.id, linkedPlayerId].filter((id): id is string => !!id))),
    [gk.id, linkedPlayerId],
  );
  const displayClub = linkedPlayer?.current_club || gk.club;
  const displayLeague = linkedPlayer?.league || gk.league;
  const profileSummary = [
    gk.tags.includes("Free Agent") ? "Free Agent" : (displayClub || "Club not recorded"),
    !gk.tags.includes("Free Agent") ? displayLeague : null,
    gk.nationality || "Nationality not recorded",
    `${gk.age} yrs`,
    gk.height,
    gk.foot ? `${gk.foot} foot` : null,
  ].filter((value): value is string => Boolean(value));
  const gkInteractions = useMemo(
    () =>
      (loggedInteractions ?? [])
        .filter((i) => interactionBelongsToGoalkeeper(i, gk, linkedPlayerId))
        .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)),
    [loggedInteractions, gk, linkedPlayerId],
  );
  
  const [gkMedia, setGkMedia] = useState<MediaAsset[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const loadMedia = useCallback(async () => {
    setMediaLoading(true);
    setMediaError(null);
    try {
      setGkMedia(await listMedia({ gkIds: mediaGoalkeeperIds }));
    } catch (e) {
      setMediaError(e instanceof Error ? e.message : "Could not load media");
    } finally {
      setMediaLoading(false);
    }
  }, [mediaGoalkeeperIds]);
  useEffect(() => { void loadMedia(); }, [loadMedia]);
  useEffect(() => {
    const h = () => { void loadMedia(); };
    window.addEventListener("rpm:media-uploaded", h);
    window.addEventListener("rpm:media-updated", h);
    return () => {
      window.removeEventListener("rpm:media-uploaded", h);
      window.removeEventListener("rpm:media-updated", h);
    };
  }, [loadMedia]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);

  const queryClient = useQueryClient();
  const listFn = useServerFn(listMatchReports);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["match-reports"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const h = () => {
      void queryClient.invalidateQueries({ queryKey: ["match-reports"] });
    };
    window.addEventListener("rpm:report-submitted", h);
    return () => window.removeEventListener("rpm:report-submitted", h);
  }, [queryClient]);

  const gkReports = useMemo<MatchReportRow[]>(() => {
    const target = normaliseName(gk.name);
    const all = data?.reports ?? [];
    return all
      .filter((r) => normaliseName(r.goalkeeper) === target)
      .sort((a, b) => compareMatchDatesNewestFirst(a.match_date, b.match_date));
  }, [data, gk.name]);

  const last5 = useMemo(() => gkReports.slice(0, 5), [gkReports]);

  const averageRating = useMemo(() => {
    const vals = gkReports.map((r) => r.average).filter(isValidScore);
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(mean * 10) / 10;
  }, [gkReports]);

  const ratingContributors = useMemo(
    () => gkReports.filter((r) => isValidScore(r.average)),
    [gkReports],
  );

  const pillarAverages = useMemo(() => {
    const out: Record<PillarId, number | null> = {
      protect_goal: null, protect_space: null, protect_air: null,
      control_play: null, change_play: null, psych: null, physical: null,
    };
    for (const id of PILLAR_IDS) {
      const vals = last5.map((r) => r.scores[id]).filter(isValidScore);
      out[id] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    return out;
  }, [last5]);

  const pillarContributors = useMemo(() => {
    const out: Record<PillarId, MatchReportRow[]> = {
      protect_goal: [], protect_space: [], protect_air: [],
      control_play: [], change_play: [], psych: [], physical: [],
    };
    for (const id of PILLAR_IDS) {
      out[id] = last5.filter((r) => isValidScore(r.scores[id]));
    }
    return out;
  }, [last5]);

  const reportRef = (r: MatchReportRow) =>
    `${r.match_date ? formatDate(r.match_date) : "undated"} · ${r.opponent?.trim() || "opponent TBC"}`;

  /** Multi-line tooltip: date, opponent, and which pillars have valid 1–5 scores. */
  const reportTooltip = (r: MatchReportRow, extra?: string) => {
    const validPillars = PILLAR_IDS.filter((id) => isValidScore(r.scores[id]));
    const pillarLine = validPillars.length
      ? `Valid pillars (${validPillars.length}/${PILLAR_IDS.length}): ${validPillars.map((id) => `${PILLAR_LABELS[id]} ${r.scores[id]}/5`).join(", ")}`
      : "No valid pillar scores (1–5) on this report";
    return [
      `Date: ${r.match_date ? formatDate(r.match_date) : "not recorded"}`,
      `Opponent: ${r.opponent?.trim() || "not recorded"}`,
      pillarLine,
      extra ?? "",
    ].filter(Boolean).join("\n");
  };

  type TimelineItem =
    | { kind: "interaction"; id: string; date: string; type: string; notes: string; outcome: string; followUp: string }
    | { kind: "report"; id: string; date: string | null; report: MatchReportRow };

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...gkInteractions.map((i) => ({
        kind: "interaction" as const,
        id: i.id,
        date: i.occurredAt,
        type: i.interactionType,
        notes: i.notes,
        outcome: i.outcome,
        followUp: i.followUp,
      })),
      ...gkReports.map((r) => ({
        kind: "report" as const,
        id: r.report_id,
        date: r.match_date,
        report: r,
      })),
    ];
    return items.sort((a, b) => {
      // Interactions with red / concerning outcomes float first; reports keep date order within band.
      const aOutcome = a.kind === "interaction" ? a.outcome : "";
      const bOutcome = b.kind === "interaction" ? b.outcome : "";
      const aDate = a.date ?? "";
      const bDate = b.date ?? "";
      if (a.kind === "interaction" || b.kind === "interaction") {
        return compareInteractionsByAlertThenDate(
          { outcome: aOutcome || "On track", date: aDate },
          { outcome: bOutcome || "On track", date: bDate },
        );
      }
      return +new Date(bDate) - +new Date(aDate);
    });
  }, [gkInteractions, gkReports]);

  const ValidityHint = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
      <Info className="size-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );


  return (
    <div className="space-y-5">
      <Link to="/goalkeepers" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Goalkeepers</Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <Avatar initials={gk.initials} size={56} imageUrl={gk.profileImage} alt={`${gk.name} portrait`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{gk.name}</h1>
              <TierBadge tier={gk.tier} />
              {gk.tags.map((tag: string) => <TierBadge key={tag} tier={tag as Tier} />)}
              {gk.onLoan && <Pill tone="info">On loan{gk.parentClub ? ` from ${gk.parentClub}` : ""}</Pill>}
            </div>
            <div className="mt-1 text-sm leading-snug text-muted-foreground">
              {profileSummary.join(" · ")}
            </div>
            {/* Prefer a name-matched players row so club corrections work even
                when the legacy profile has no stored playerId. */}
            {linkedPlayerId ? (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                <Link to="/system/players/$playerId" params={{ playerId: linkedPlayerId }} className="text-primary hover:underline">
                  View player record
                </Link>
                <UpdateClubButton
                  playerId={linkedPlayerId}
                  playerName={gk.name}
                  currentClub={displayClub ?? ""}
                />
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">Player record not linked — this profile is read-only.</div>
            )}

            {gk.instagram && (
              <div className="mt-1 text-xs">
                <a
                  href={gk.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                  aria-label={`${gk.name} on Instagram (opens in new tab)`}
                >
                  @{gk.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "") || "instagram"}
                </a>
              </div>
            )}
          </div>
        </div>
        {(can("interactions.log") || can("reports.submit")) && (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            {can("interactions.log") && (
              <button
                onClick={() => setWorkflow("interaction")}
                className="h-11 min-w-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground sm:flex-none"
              >
                Log Interaction
              </button>
            )}
            {can("reports.submit") && (
              <button
                onClick={() => setWorkflow("report")}
                className="h-11 min-w-0 rounded-md border border-border px-3 text-sm sm:flex-none"
              >
                Submit Report
              </button>
            )}
          </div>
        )}
      </div>

      {gk.bio && (
        <Card className="p-4">
          <SectionTitle>Profile</SectionTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">{gk.bio}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {([
          {
            label: "Rating",
            value: isLoading
              ? "…"
              : isError
                ? "—"
                : averageRating != null
                  ? `${averageRating.toFixed(1)}/5`
                  : "—",
            hint: !isLoading && !isError && averageRating != null
              ? `${ratingContributors.length} report${ratingContributors.length === 1 ? "" : "s"}`
              : undefined,
          },
          { label: "Contract expiry", value: formatContractExpiry(gk.contractUntil) },
          { label: "Date of birth", value: `${formatDob(gk.dob)} (${gk.age})` },
          { label: "Height", value: gk.height || "—" },
          { label: "Shirt no.", value: gk.shirtNumber != null ? String(gk.shirtNumber) : "—" },
          { label: "Preferred foot", value: gk.foot || "—" },
        ] as const).map((metric) => (
          <Card key={metric.label} className="px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums leading-tight">{metric.value}</div>
            {"hint" in metric && metric.hint ? (
              <div className="mt-0.5 text-[10px] text-muted-foreground">{metric.hint}</div>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <SectionTitle>Highlight Reel</SectionTitle>
          {gk.videoLinks.length > 0 ? (
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {gk.videoLinks.length} clip{gk.videoLinks.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {gk.videoLinks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">No highlight reel uploaded yet.</p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              Slot reserved for {gk.name} — add a reel when footage is ready.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {gk.videoLinks.map((url, index) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-accent/10 px-2.5 py-2 text-xs hover:border-primary/40 hover:bg-accent/30"
                >
                  <Video className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{reelLabel(url, index)}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <SectionTitle>Activity Timeline</SectionTitle>
          <div className="relative pl-5 space-y-3 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-border">
            {timelineItems.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">No activity recorded yet.</div>
            ) : (
              timelineItems.map((item) => {
                if (item.kind === "report") {
                  const r = item.report;
                  return (
                    <div key={item.id} className="relative">
                      <div className="absolute -left-[15px] top-1 size-3 rounded-full bg-success ring-4 ring-background" />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-sm font-medium"><FileText className="size-3.5 text-muted-foreground" />Match Report</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums font-mono">{r.match_date ? formatDate(r.match_date) : "undated"} · {r.match_date ? formatRelative(r.match_date) : formatRelative(new Date().toISOString())}</div>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {r.opponent ? `Match report vs ${r.opponent}` : "Match report submitted"}
                        {r.competition ? ` · ${r.competition}` : ""}
                      </div>
                      <div className="flex gap-1.5 mt-1.5">
                        {r.average != null && <Pill tone="success">Avg {r.average.toFixed(1)}/5</Pill>}
                        {r.coach && <Pill tone="info">{r.coach}</Pill>}
                      </div>
                    </div>
                  );
                }
                const Icon = TYPE_ICON[item.type] ?? FileText;
                return (
                  <div key={item.id} className="relative">
                    <div className="absolute -left-[15px] top-1 size-3 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-3.5 text-muted-foreground" />{item.type}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums font-mono">{formatDate(item.date)} · {formatRelative(item.date)}</div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{item.notes}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5"><Pill tone={interactionOutcomeAlertRank(item.outcome) === 0 ? "destructive" : interactionOutcomeAlertRank(item.outcome) === 1 ? "warning" : "muted"}>{item.outcome}</Pill><Pill tone="info">↳ {item.followUp}</Pill></div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              <SectionTitle>Match Reports ({isLoading ? "…" : gkReports.length})</SectionTitle>
              <div className="flex items-center gap-2">
                {gkReports.length > 0 && (
                  <Link
                    to="/reports"
                    search={{ from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: "", openSubmit: "", last5Gk: gk.name }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    View last 5 in Reports →
                  </Link>
                )}
                {isError && (
                  <button onClick={() => refetch()} className="text-[11px] text-primary hover:underline">Retry</button>
                )}
              </div>
            </div>
            {isLoading ? (
              <div className="text-xs text-muted-foreground italic py-2">Loading real Match Reports…</div>
            ) : isError ? (
              <div className="text-xs text-destructive py-2">
                Couldn't load Match Reports. {isFetching ? "Retrying…" : "Try again."}
              </div>
            ) : gkReports.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">No Match Reports recorded for this goalkeeper yet.</div>
            ) : (
              <div className="space-y-2">
                {gkReports.slice(0, 5).map((r) => (
                  <Link
                    key={r.report_id}
                    to="/reports/$reportId"
                    params={{ reportId: r.report_id }}
                    className="flex items-center gap-2 p-2 rounded-md bg-accent/20 border border-border/40 hover:border-primary/40"
                  >
                    <FileText className="size-3.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        Match Report{r.opponent ? ` · Opponent: ${r.opponent}` : ""}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Date: {r.match_date ? formatDate(r.match_date) : "not recorded"}
                        {r.competition ? ` · Competition: ${r.competition}` : ""}
                      </div>
                    </div>
                    <span className="text-xs font-semibold tabular-nums font-mono">
                      {r.average != null ? `Avg: ${r.average.toFixed(1)}/5` : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle>Skill Scores (last 5 match reports)</SectionTitle>
            {isLoading ? (
              <div className="text-xs text-muted-foreground italic py-2">Loading…</div>
            ) : isError ? (
              <div className="text-xs text-destructive py-2">Couldn't load skill scores.</div>
            ) : gkReports.length === 0 ? (
              <div className="space-y-1.5 py-2">
                <div className="text-xs text-muted-foreground italic">No skill scores available</div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Pillar means are calculated from valid 1–5 scores across the last 5 match reports.
                </div>
                <Link to="/reports" search={{ from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: gk.name, openSubmit: "1" }} className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
                  Submit a Match Report for {gk.name}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] uppercase text-muted-foreground">
                  Pool of last {last5.length} report{last5.length === 1 ? "" : "s"}:
                  <span className="ml-1 normal-case text-muted-foreground/80 tracking-normal">
                    {last5.map(reportRef).join(" · ")}
                  </span>
                </div>
                {PILLAR_IDS.map((id) => {
                  const v = pillarAverages[id];
                  const contributors = pillarContributors[id];
                  const hasEnough = contributors.length >= 5;
                  return (
                    <div key={id}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-muted-foreground">{PILLAR_LABELS[id]}</span>
                        <span className="tabular-nums font-mono font-medium">
                          {hasEnough && v != null
                            ? `${v.toFixed(1)}/5`
                            : <span className="text-muted-foreground italic" title="At least 5 valid 1–5 scores for this pillar in the last 5 reports are needed to show an average">not recorded</span>}
                        </span>
                      </div>
                      <div className="flex gap-1.5 mb-1" aria-label={`${PILLAR_LABELS[id]} status: ${contributors.length} of 5 valid scores submitted`}>
                        <Pill tone="success">{contributors.length} submitted</Pill>
                        <Pill tone={5 - contributors.length > 0 ? "warning" : "muted"}>{5 - contributors.length} missing</Pill>
                      </div>
                      {hasEnough && <ProgressBar value={v != null ? (v / 5) * 100 : 0} />}
                      {!hasEnough && (
                        <div className="text-[11px] text-muted-foreground leading-snug mt-1 space-y-1">
                          <div>
                            <span className="font-medium text-foreground">{contributors.length} of 5</span> scored reports available for this pillar.
                            Need <span className="font-medium text-foreground">{5 - contributors.length}</span> more with a valid {PILLAR_LABELS[id]} score (1–5).
                          </div>
                          <ValidityHint>
                            A valid scored report has a <span className="font-medium text-foreground">{PILLAR_LABELS[id]}</span> score between 1 and 5.
                          </ValidityHint>

                          {contributors.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {contributors.map((r) => (
                                <button
                                  key={r.report_id}
                                  type="button"
                                  onClick={() => setPreviewId(r.report_id)}
                                  title={reportTooltip(r, `${PILLAR_LABELS[id]}: ${r.scores[id]}/5\nClick to preview`)}
                                  aria-label={`Preview match report for ${r.match_date ? formatDate(r.match_date) : "undated match"} versus ${r.opponent?.trim() || "opponent TBC"}, ${PILLAR_LABELS[id]} score ${r.scores[id]} of 5`}
                                  className="px-1.5 py-0.5 rounded border border-border/60 bg-accent/20 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {reportRef(r)}
                                </button>
                              ))}
                              {Array.from({ length: 5 - contributors.length }).map((_, i) => (
                                <span
                                  key={`missing-${id}-${i}`}
                                  className="px-1.5 py-0.5 rounded border border-dashed border-border/60 text-[10px] text-muted-foreground/70 italic"
                                  title={`Missing report with a valid ${PILLAR_LABELS[id]} score`}
                                >
                                  missing report
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Link
                              to="/reports"
                              search={{ from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: gk.name, openSubmit: "1", last5Gk: "" }}
                              className="text-primary hover:underline inline-flex items-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            >
                              Submit a Match Report for {gk.name}
                            </Link>
                            <Link to="/calendar" search={{ gkId: gk.id }} className="text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-0.5">
                              <CalendarIcon className="size-3.5" /> See upcoming matches
                            </Link>
                          </div>

                        </div>
                      )}
                      {hasEnough && contributors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {contributors.map((r) => (
                            <button
                              key={r.report_id}
                              type="button"
                              onClick={() => setPreviewId(r.report_id)}
                              title={reportTooltip(r, `${PILLAR_LABELS[id]}: ${r.scores[id]}/5\nClick to preview`)}
                              aria-label={`Preview match report for ${r.match_date ? formatDate(r.match_date) : "undated match"} versus ${r.opponent?.trim() || "opponent TBC"}, ${PILLAR_LABELS[id]} score ${r.scores[id]} of 5`}
                              className="px-1.5 py-0.5 rounded border border-border/60 bg-accent/20 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary"
                            >
                              {reportRef(r)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {gkReports.length > 0 && gkReports.length < 5 && (
                  <div className="text-[11px] text-muted-foreground leading-snug border-t border-border/40 pt-2">
                    <span className="font-medium text-foreground">{gkReports.length} of 5</span> match reports available for this goalkeeper.
                    <Link to="/reports" search={{ from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: gk.name, openSubmit: "1" }} className="ml-1 text-primary hover:underline">
                      Submit a Match Report for {gk.name}
                    </Link>
                    <Link to="/calendar" search={{ gkId: gk.id }} className="ml-2 text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-0.5">
                      <CalendarIcon className="size-3.5" /> See upcoming matches
                    </Link>
                  </div>
                )}

              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle>Media ({gkMedia.length})</SectionTitle>
              {can("media.upload") && (
                <button
                  onClick={() => setWorkflow("media")}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] hover:bg-accent"
                >
                  <Upload className="size-3.5" /> Upload
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {mediaLoading && <p className="text-xs text-muted-foreground">Loading media…</p>}
              {mediaError && <p className="text-xs text-destructive">{mediaError}</p>}
              {!mediaLoading && !mediaError && gkMedia.length === 0 && (
                <p className="text-xs text-muted-foreground">No media linked to {gk.name} yet.</p>
              )}
              {gkMedia.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => { void openAsset(m, user); }}
                    className="min-w-0 flex-1 truncate text-left hover:underline inline-flex items-center gap-1"
                    title={`${m.title} · ${formatBytes(m.file_size)}`}
                  >
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{m.title}</span>
                  </button>
                  <Pill>{m.media_type}</Pill>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <WorkflowDialog
        kind={workflow}
        onClose={() => setWorkflow(null)}
        prefillGoalkeeper={gk.name}
        prefillGkId={linkedPlayerId ?? undefined}
      />
      <ReportPreviewModal
        reportId={previewId}
        open={previewId !== null}
        onOpenChange={(o) => { if (!o) setPreviewId(null); }}
      />
    </div>
  );
}
