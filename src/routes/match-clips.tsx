import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Clapperboard, DatabaseZap, Filter, Plus, Upload, X } from "lucide-react";

import { Card, EmptyState, PageHeader } from "@/components/primitives";
import { MediaTile } from "@/components/media-tile";
import { MatchClipUploadDialog } from "@/components/match-clips/match-clip-upload-form";
import { EditMediaDialog } from "@/components/workflows";
import { withPermission } from "@/components/require-permission";
import { useAuth } from "@/lib/auth";
import { listCalendarEvents, type TeamCalendarEvent } from "@/lib/calendar.functions";
import {
  UNMATCHED_GROUP_KEY,
  describeMatchClips,
  filterGroupsByMatchDate,
  goalkeeperIdForMatch,
  groupClipsByMatch,
  isMissingMatchClipsSchema,
  matchLabel,
  type MatchClipGroup,
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

export const Route = createFileRoute("/match-clips")({
  component: withPermission(MatchClipsPage, "media.view"),
});

const MATCH_CLIPS_QUERY_KEY = ["match-clips"] as const;

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

  const [gkId, setGkId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
  const allGroups = useMemo(() => groupClipsByMatch(clips, eventsById), [clips, eventsById]);
  const groups = useMemo(
    () => filterGroupsByMatchDate(allGroups, from || undefined, to || undefined),
    [allGroups, from, to],
  );

  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const clip of clips) {
        if (!clip.thumbnail_path || thumbUrls[clip.id]) continue;
        try {
          updates[clip.id] = await getSignedUrl(clip.thumbnail_path, 3600);
        } catch {
          /* the tile falls back to its type icon */
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setThumbUrls((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clips, thumbUrls]);

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

  const narrowed = Boolean(gkId || from || to);
  const missingSchema =
    clipsQuery.isError &&
    isMissingMatchClipsSchema(
      clipsQuery.error instanceof Error ? clipsQuery.error.message : String(clipsQuery.error),
    );
  const clipCount = groups.reduce((sum, group) => sum + group.clips.length, 0);

  const description = clipsQuery.isLoading
    ? "Loading…"
    : clipsQuery.isError
      ? "Match clips could not be loaded."
      : narrowed
        ? `${clipCount} ${clipCount === 1 ? "clip" : "clips"} matching filters.`
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

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="match-clips-goalkeeper" className="sr-only">
          Filter by goalkeeper
        </label>
        <select
          id="match-clips-goalkeeper"
          value={gkId}
          onChange={(event) => setGkId(event.target.value)}
          className="h-9 rounded-md border border-border bg-input/60 px-2 text-sm"
        >
          <option value="">All goalkeepers</option>
          {goalkeeperOptions.map((goalkeeper) => (
            <option key={goalkeeper.id} value={goalkeeper.id}>
              {goalkeeper.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <label htmlFor="match-clips-from" className="text-[11px] text-muted-foreground">
            Match date from
          </label>
          <input
            id="match-clips-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 rounded-md border border-border bg-input/60 px-2 text-xs"
          />
          <label htmlFor="match-clips-to" className="text-[11px] text-muted-foreground">
            to
          </label>
          <input
            id="match-clips-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 rounded-md border border-border bg-input/60 px-2 text-xs"
          />
        </div>
        {narrowed && (
          <button
            type="button"
            onClick={() => {
              setGkId("");
              setFrom("");
              setTo("");
            }}
            className="inline-flex h-9 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            Reset
          </button>
        )}
      </div>

      {clipsQuery.isLoading ? (
        <GroupSkeleton />
      ) : missingSchema ? (
        <Card>
          <EmptyState
            icon={DatabaseZap}
            title="Match Clips is waiting for a database update"
            description="The database has not been updated for Match Clips yet. Nothing has been lost — the Media Library still holds every file."
          />
        </Card>
      ) : clipsQuery.isError ? (
        <Card>
          <EmptyState
            icon={Filter}
            title="Match clips could not be loaded"
            description="The library did not respond. Try again — nothing has been changed or deleted."
            primaryAction={
              <button
                type="button"
                onClick={() => void clipsQuery.refetch()}
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
              !narrowed && can("media.upload") ? (
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
        <div className="space-y-4">
          {groups.map((group) => (
            <MatchGroup
              key={group.key}
              group={group}
              rosterPlayers={rosterPlayers}
              goalkeeperName={(id) => resolveGoalkeeper(id, rosterById)}
              renderTile={(clip, showGoalkeeper) => (
                <MediaTile
                  key={clip.id}
                  asset={clip}
                  goalkeeperLabel={
                    showGoalkeeper
                      ? clip.gk_id
                        ? resolveGoalkeeper(clip.gk_id, rosterById).name
                        : "No goalkeeper"
                      : null
                  }
                  thumbUrl={thumbUrls[clip.id]}
                  busy={busyId === clip.id}
                  onOpen={() => void handleOpen(clip)}
                  onEdit={canEditAsset(clip, user) ? () => setEditing(clip) : undefined}
                  onDelete={canDeleteAsset(clip, user) ? () => void handleDelete(clip) : undefined}
                />
              )}
              onAddClips={
                can("media.upload") && group.event ? () => openUpload(group.event!.id) : undefined
              }
            />
          ))}
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

function MatchGroup({
  group,
  rosterPlayers,
  goalkeeperName,
  renderTile,
  onAddClips,
}: {
  group: MatchClipGroup<TeamCalendarEvent>;
  rosterPlayers: readonly { id: string; full_name: string }[];
  goalkeeperName: (gkId: string) => { name: string; club: string | null };
  renderTile: (clip: MediaAsset, showGoalkeeper: boolean) => ReactNode;
  onAddClips?: () => void;
}) {
  const unmatched = group.key === UNMATCHED_GROUP_KEY;
  const matchGkId = group.event ? goalkeeperIdForMatch(group.event, rosterPlayers) : null;
  const matchGk = matchGkId ? goalkeeperName(matchGkId) : null;
  const title = group.event
    ? matchLabel(group.event)
    : unmatched
      ? "Unmatched"
      : "Match no longer in the calendar";
  const subtitle = unmatched
    ? "Clips not linked to a calendar match"
    : matchGk
      ? [matchGk.name, matchGk.club].filter(Boolean).join(" · ")
      : (group.event?.goalkeeper_name ?? null);

  return (
    <section aria-label={title} className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {subtitle ? `${subtitle} · ` : ""}
            {group.clips.length} {group.clips.length === 1 ? "clip" : "clips"}
          </p>
        </div>
        {onAddClips && (
          <button
            type="button"
            onClick={onAddClips}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent"
          >
            <Plus className="size-3.5" />
            Add clips
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {group.clips.map((clip) =>
          renderTile(clip, unmatched || !matchGkId || clip.gk_id !== matchGkId),
        )}
      </div>
    </section>
  );
}

function GroupSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="rounded-lg border border-border p-4">
          <div className="mb-3 h-4 w-64 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="aspect-[4/3] animate-pulse rounded-md bg-muted" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
