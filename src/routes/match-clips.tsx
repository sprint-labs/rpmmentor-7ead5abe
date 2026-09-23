import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clapperboard, DatabaseZap, Filter, Plus, Search, Upload, X } from "lucide-react";

import { Card, EmptyState, PageHeader } from "@/components/primitives";
import { MediaTile } from "@/components/media-tile";
import { ShelfHeader, ShelfSkeleton, ShelfTrack } from "@/components/media-shelf";
import { MatchClipUploadDialog } from "@/components/match-clips/match-clip-upload-form";
import { EditMediaDialog } from "@/components/workflows";
import { withPermission } from "@/components/require-permission";
import { useAuth } from "@/lib/auth";
import { listCalendarEvents, type TeamCalendarEvent } from "@/lib/calendar.functions";
import {
  COMPETITION_NOT_SET,
  UNMATCHED_GROUP_KEY,
  competitionLabel,
  describeMatchClips,
  filterMatchClipGroups,
  formatMatchDate,
  goalkeeperIdForMatch,
  groupClipsByMatch,
  isMissingMatchClipsSchema,
  matchFacts,
  type MatchClipGroup,
  type MatchFacts,
} from "@/lib/match-clips";
import {
  canDeleteAsset,
  canEditAsset,
  deleteMedia,
  getSignedUrl,
  listMatchClips,
  openAsset,
  type MediaAsset,
} from "@/lib/media-store";
import { aliasesForGkId, buildGoalkeeperIdentities, resolveGoalkeeper } from "@/lib/media-shelves";
import { listPlayers } from "@/lib/players.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match-clips")({
  component: withPermission(MatchClipsPage, "media.view"),
});

const MATCH_CLIPS_QUERY_KEY = ["match-clips"] as const;

/** The same tile width the Media Library shelves use. */
const TILE_CLASS = "w-[168px] shrink-0 snap-start sm:w-[196px]";

/** Thumbnails are signed for an hour and re-signed after 50 minutes. */
const THUMB_URL_TTL_S = 3600;
const THUMB_REFRESH_AFTER_MS = 50 * 60_000;
const THUMB_RECHECK_MS = 5 * 60_000;

const SELECT_CLASS = "h-9 rounded-md border border-border bg-input/60 px-2 text-sm";

function sortedUnique(values: Iterable<string | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function MatchClipsPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const listPlayersFn = useServerFn(listPlayers);
  const listEventsFn = useServerFn(listCalendarEvents);
  const { data: rosterPlayers = [] } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  const eventsQuery = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => listEventsFn(),
    staleTime: 60_000,
  });
  const rosterById = useMemo(() => buildGoalkeeperIdentities(rosterPlayers), [rosterPlayers]);
  const goalkeeperOptions = useMemo(
    () =>
      [...rosterPlayers]
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map((player) => ({ id: player.id, name: player.full_name })),
    [rosterPlayers],
  );

  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("");
  const [competition, setCompetition] = useState("");
  const [team, setTeam] = useState("");
  const [gkId, setGkId] = useState("");
  const gkIds = useMemo(() => (gkId ? aliasesForGkId(gkId, rosterById) : []), [gkId, rosterById]);

  const clipsQuery = useQuery({
    queryKey: [...MATCH_CLIPS_QUERY_KEY, gkIds],
    queryFn: () => listMatchClips({ gkIds }),
    retry: (count, error) =>
      !isMissingMatchClipsSchema(error instanceof Error ? error.message : null) && count < 2,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: MATCH_CLIPS_QUERY_KEY }),
    [queryClient],
  );
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener("rpm:media-uploaded", onChange);
    window.addEventListener("rpm:media-updated", onChange);
    return () => {
      window.removeEventListener("rpm:media-uploaded", onChange);
      window.removeEventListener("rpm:media-updated", onChange);
    };
  }, [refresh]);

  const clips = useMemo(() => clipsQuery.data ?? [], [clipsQuery.data]);
  const eventsById = useMemo(
    () =>
      new Map<string, TeamCalendarEvent>(
        (eventsQuery.data ?? []).map((event) => [event.id, event]),
      ),
    [eventsQuery.data],
  );

  // Competition is read from the fixture alone. A blank one shows as
  // "Competition not set" rather than being guessed from the goalkeeper's league.
  const factsFor = useCallback((event: TeamCalendarEvent): MatchFacts => matchFacts(event), []);

  const allGroups = useMemo(() => groupClipsByMatch(clips, eventsById), [clips, eventsById]);
  const allFacts = useMemo(
    () => allGroups.flatMap((group) => (group.event ? [factsFor(group.event)] : [])),
    [allGroups, factsFor],
  );
  const seasonOptions = useMemo(
    () => sortedUnique(allFacts.map((facts) => facts.season)).reverse(),
    [allFacts],
  );
  const competitionOptions = useMemo(() => {
    const named = sortedUnique(allFacts.map((facts) => facts.competition));
    // Listed last so records missing a competition can be found and corrected.
    return allFacts.some((facts) => !facts.competition) ? [...named, COMPETITION_NOT_SET] : named;
  }, [allFacts]);
  const teamOptions = useMemo(
    () => sortedUnique(allFacts.flatMap((facts) => facts.teams)),
    [allFacts],
  );

  const groups = useMemo(
    () =>
      filterMatchClipGroups(
        allGroups,
        { query, season, competition, team },
        factsFor,
        (id) => resolveGoalkeeper(id, rosterById).name,
      ),
    [allGroups, query, season, competition, team, factsFor, rosterById],
  );

  // Signed thumbnail URLs expire, so each is kept with the time it goes stale
  // and re-signed after that; a page left open would otherwise show broken art.
  const [thumbs, setThumbs] = useState<Record<string, { url: string; staleAt: number }>>({});
  const [thumbClock, setThumbClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setThumbClock(Date.now()), THUMB_RECHECK_MS);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates: Record<string, { url: string; staleAt: number }> = {};
      for (const clip of clips) {
        const cached = thumbs[clip.id];
        if (!clip.thumbnail_path || (cached && cached.staleAt > thumbClock)) continue;
        try {
          const url = await getSignedUrl(clip.thumbnail_path, THUMB_URL_TTL_S);
          updates[clip.id] = { url, staleAt: Date.now() + THUMB_REFRESH_AFTER_MS };
        } catch {
          /* the tile falls back to its type icon */
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setThumbs((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clips, thumbs, thumbClock]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMatchId, setUploadMatchId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openUpload = (matchId: string | null) => {
    setUploadMatchId(matchId);
    setUploadOpen(true);
  };

  const handleOpen = async (clip: MediaAsset) => {
    try {
      await openAsset(clip, user);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (clip: MediaAsset) => {
    if (!confirm(`Delete "${clip.title}"? This cannot be undone.`)) return;
    setBusyId(clip.id);
    try {
      await deleteMedia(clip, user);
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const narrowed = Boolean(query.trim() || season || competition || team || gkId);
  const reset = () => {
    setQuery("");
    setSeason("");
    setCompetition("");
    setTeam("");
    setGkId("");
  };
  const missingSchema =
    clipsQuery.isError &&
    isMissingMatchClipsSchema(
      clipsQuery.error instanceof Error ? clipsQuery.error.message : String(clipsQuery.error),
    );
  const clipCount = groups.reduce((sum, group) => sum + group.clips.length, 0);

  // Clips are grouped by their calendar match, so the calendar has to be in
  // hand first: without it every linked clip would read as a deleted fixture.
  const loading = clipsQuery.isLoading || eventsQuery.isLoading;
  const loadFailed = clipsQuery.isError || eventsQuery.isError;
  const description = loading
    ? "Loading…"
    : loadFailed
      ? "Match clips could not be loaded."
      : narrowed
        ? `${clipCount} ${clipCount === 1 ? "clip" : "clips"} matching filters`
        : describeMatchClips(allGroups);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Match Clips"
        description={description}
        action={
          can("media.upload") ? (
            <button
              type="button"
              onClick={() => openUpload(null)}
              disabled={missingSchema}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Upload className="size-4" />
              Upload clips
            </button>
          ) : null
        }
      />

      <div className="sticky top-16 z-[5] -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:top-14 md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="match-clips-search" className="sr-only">
              Search teams, competitions, goalkeepers or clips
            </label>
            <input
              id="match-clips-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search teams, competitions, goalkeepers or clips"
              className="h-9 w-full rounded-md border border-border bg-input/60 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <FilterSelect
            id="match-clips-season"
            label="Season"
            allLabel="All seasons"
            value={season}
            options={seasonOptions}
            onChange={setSeason}
          />
          <FilterSelect
            id="match-clips-competition"
            label="Competition"
            allLabel="All competitions"
            value={competition}
            options={competitionOptions}
            onChange={setCompetition}
          />
          <FilterSelect
            id="match-clips-team"
            label="Team"
            allLabel="All teams"
            value={team}
            options={teamOptions}
            onChange={setTeam}
          />
          <label htmlFor="match-clips-goalkeeper" className="sr-only">
            Goalkeeper
          </label>
          <select
            id="match-clips-goalkeeper"
            value={gkId}
            onChange={(event) => setGkId(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All goalkeepers</option>
            {goalkeeperOptions.map((goalkeeper) => (
              <option key={goalkeeper.id} value={goalkeeper.id}>
                {goalkeeper.name}
              </option>
            ))}
          </select>
          {narrowed && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <ShelfSkeleton />
      ) : missingSchema ? (
        <Card>
          <EmptyState
            icon={DatabaseZap}
            title="Match Clips is waiting for a database update"
            description="The database has not been updated for Match Clips yet. Nothing has been lost — the Media Library still holds every file."
          />
        </Card>
      ) : loadFailed ? (
        <Card>
          <EmptyState
            icon={Filter}
            title="Match clips could not be loaded"
            description="The library did not respond. Try again — nothing has been changed or deleted."
            primaryAction={
              <button
                type="button"
                onClick={() => {
                  void clipsQuery.refetch();
                  void eventsQuery.refetch();
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                Try again
              </button>
            }
          />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={narrowed ? Filter : Clapperboard}
            title={narrowed ? "No match clips match these filters" : "No match clips yet"}
            description={
              narrowed
                ? "Change or reset the filters to see more."
                : "Upload clips from a goalkeeper's recent match and they will be grouped here by match."
            }
            primaryAction={
              narrowed ? (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                >
                  <X className="size-3.5" /> Reset filters
                </button>
              ) : can("media.upload") ? (
                <button
                  type="button"
                  onClick={() => openUpload(null)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                >
                  <Upload className="size-4" />
                  Upload clips
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => {
            const { title, subtitle, matchGkId } = describeGroup(
              group,
              factsFor,
              rosterPlayers,
              (id) => resolveGoalkeeper(id, rosterById).name,
            );
            const unmatched = group.key === UNMATCHED_GROUP_KEY;
            return (
              <section key={group.key} aria-label={title}>
                <ShelfHeader
                  title={title}
                  subtitle={subtitle}
                  count={group.clips.length}
                  action={
                    can("media.upload") && group.event ? (
                      <button
                        type="button"
                        onClick={() => openUpload(group.event!.id)}
                        className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="size-3" />
                        Add clips
                      </button>
                    ) : null
                  }
                />
                <ShelfTrack>
                  {group.clips.map((clip) => (
                    <MediaTile
                      key={clip.id}
                      asset={clip}
                      className={TILE_CLASS}
                      goalkeeperLabel={
                        unmatched || !matchGkId || clip.gk_id !== matchGkId
                          ? clip.gk_id
                            ? resolveGoalkeeper(clip.gk_id, rosterById).name
                            : "Unlinked"
                          : null
                      }
                      thumbUrl={thumbs[clip.id]?.url}
                      busy={busyId === clip.id}
                      onOpen={() => void handleOpen(clip)}
                      onEdit={canEditAsset(clip, user) ? () => setEditing(clip) : undefined}
                      onDelete={
                        canDeleteAsset(clip, user) ? () => void handleDelete(clip) : undefined
                      }
                    />
                  ))}
                </ShelfTrack>
              </section>
            );
          })}
        </div>
      )}

      <MatchClipUploadDialog
        open={uploadOpen}
        prefillMatchId={uploadMatchId}
        onClose={() => setUploadOpen(false)}
      />
      <EditMediaDialog asset={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Shelf heading: the fixture, then date · competition · goalkeeper. */
function describeGroup(
  group: MatchClipGroup<TeamCalendarEvent>,
  factsFor: (event: TeamCalendarEvent) => MatchFacts,
  rosterPlayers: readonly { id: string; full_name: string }[],
  goalkeeperName: (gkId: string) => string,
): { title: string; subtitle: string | null; matchGkId: string | null } {
  if (!group.event) {
    return group.key === UNMATCHED_GROUP_KEY
      ? { title: "Unmatched", subtitle: "not linked to a calendar match", matchGkId: null }
      : { title: "Match no longer in the calendar", subtitle: null, matchGkId: null };
  }
  const facts = factsFor(group.event);
  const matchGkId = goalkeeperIdForMatch(group.event, rosterPlayers);
  const goalkeeper = matchGkId ? goalkeeperName(matchGkId) : group.event.goalkeeper_name;
  // The title already carries "(Competition)" on some fixtures; show the bare teams.
  const title = group.event.title.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Match";
  return {
    title,
    subtitle: [formatMatchDate(group.event.event_date), competitionLabel(facts), goalkeeper]
      .filter(Boolean)
      .join(" · "),
    matchGkId,
  };
}

function FilterSelect({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(SELECT_CLASS, value && "border-primary/40 text-primary-ink")}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </>
  );
}
