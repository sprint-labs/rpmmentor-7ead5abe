import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, EmptyState, Card } from "@/components/primitives";
import { DataSourceBanner } from "@/lib/data-classification";
import { Filter, Search, SlidersHorizontal, Upload, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkflowDialog, type WorkflowKind, EditMediaDialog } from "@/components/workflows";
import { MediaTile } from "@/components/media-tile";
import { ShelfHeader, ShelfSkeleton, ShelfTrack } from "@/components/media-shelf";
import { DEMO_USERS, useAuth } from "@/lib/auth";
import {
  listMedia,
  openAsset,
  deleteMedia,
  getSignedUrl,
  canDeleteAsset,
  canEditAsset,
  RATING_TAG_OPTIONS,
  type MediaAsset,
  type MediaKind,
  type MediaFilters,
} from "@/lib/media-store";
import {
  aliasesForGkId,
  buildGoalkeeperIdentities,
  buildMediaShelves,
  countMediaKinds,
  describeLibrary,
  resolveGoalkeeper,
  type MediaShelf,
} from "@/lib/media-shelves";
import { withPermission } from "@/components/require-permission";
import { getNavSource } from "@/lib/nav-source";
import { listPlayers } from "@/lib/players.functions";
import { cn } from "@/lib/utils";

const mediaSearchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  uploaderName: fallback(z.string(), "").default(""),
  mentorProfileId: fallback(z.string(), "").default(""),
  kind: fallback(z.string(), "").default(""),
  source: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/media")({
  validateSearch: zodValidator(mediaSearchSchema),
  component: withPermission(MediaPage, "media.view"),
});

/** Toolbar order, widest type first — it mirrors how the library actually fills up. */
const KINDS = ["all", "video", "audio", "pdf", "image"] as const;
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  all: "All",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  image: "Image",
};

/** The goalkeeper select folds "Unlinked only" in beside the roster. */
const UNLINKED_OPTION = "__unlinked__";

function isKind(v: string): v is MediaKind | "all" {
  return (KINDS as readonly string[]).includes(v);
}

function MediaPage() {
  const { can, user } = useAuth();
  const listPlayersFn = useServerFn(listPlayers);
  const { data: rosterPlayers = [] } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  // Keyed by BOTH `players.id` and the legacy `gk-*` slug: `media_assets.gk_id`
  // holds either, so a map keyed only on the UUID left half a goalkeeper's
  // media resolving to "Unknown goalkeeper" and sitting on a shelf of its own.
  const rosterById = useMemo(() => buildGoalkeeperIdentities(rosterPlayers), [rosterPlayers]);
  const goalkeeperFilterOptions = useMemo(
    () =>
      [...rosterPlayers]
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map((player) => ({ id: player.id, name: player.full_name })),
    [rosterPlayers],
  );
  const { from, to, uploaderName, kind: kindParam, source } = Route.useSearch();
  const navSource = getNavSource(source);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * The filters the rows in `assets` were actually fetched for.
   *
   * The heading and the count derive from `filters` synchronously, but
   * `setAssets` only runs once `listMedia` resolves. Between the two the grid
   * showed the previous goalkeeper's clips under the newly chosen
   * goalkeeper's name — on the one page whose whole job is attributing
   * footage to the right person. Comparing this against `filters` is how the
   * grid knows its contents no longer match its own heading.
   */
  const [loadedFilters, setLoadedFilters] = useState<MediaFilters | null>(null);
  /** A failed read has to say so; it used to leave the stale grid on screen. */
  const [loadError, setLoadError] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tagsDatesOpen, setTagsDatesOpen] = useState(false);
  /** "View all" on Recently added: the whole library as one grid, no filter applied. */
  const [flatView, setFlatView] = useState(false);
  const [filters, setFilters] = useState<MediaFilters>(() => {
    const initial: MediaFilters = { kind: isKind(kindParam) ? kindParam : "all" };
    if (from) initial.from = from;
    if (to) initial.to = to;
    if (uploaderName) initial.uploaderName = uploaderName;
    return initial;
  });
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setFilters((prev) => {
      const next: MediaFilters = {
        ...prev,
        from: from || undefined,
        to: to || undefined,
        uploaderName: uploaderName || undefined,
        kind: isKind(kindParam) ? kindParam : prev.kind,
      };
      // Returning a fresh object unconditionally re-ran `load` on every mount,
      // for a set of filters identical to the one already in flight. Keeping
      // the previous identity when nothing changed removes that second read.
      const unchanged =
        next.from === prev.from &&
        next.to === prev.to &&
        next.uploaderName === prev.uploaderName &&
        next.kind === prev.kind;
      return unchanged ? prev : next;
    });
  }, [from, to, uploaderName, kindParam]);

  /**
   * Only the newest read may write state.
   *
   * Reads overlap routinely — every filter keystroke starts one, and the
   * upload/update events restart one at any time. Without a generation guard a
   * slower earlier read can land *after* a newer one and write its own filters
   * into `loadedFilters`, which then never matches `filters` again: `stale`
   * stays true and the page sits on the skeleton forever. A superseded read
   * therefore writes nothing at all, not even `loading` — the read that
   * replaced it is still running and owns that flag.
   */
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);

    let rows: MediaAsset[] | null = null;
    try {
      rows = await listMedia(filters);
    } catch (e) {
      console.error(e);
    }

    if (seq !== loadSeq.current) return;

    // A failed read drops the rows rather than leaving the previous
    // goalkeeper's media sitting under this goalkeeper's heading.
    setAssets(rows ?? []);
    setLoadError(rows === null);
    setLoadedFilters(filters);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("rpm:media-uploaded", h);
    window.addEventListener("rpm:media-updated", h);
    return () => {
      window.removeEventListener("rpm:media-uploaded", h);
      window.removeEventListener("rpm:media-updated", h);
    };
  }, [load]);

  // Resolve thumbnail signed URLs lazily
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const a of assets) {
        if (!a.thumbnail_path || thumbUrls[a.id]) continue;
        try {
          const url = await getSignedUrl(a.thumbnail_path, 3600);
          if (!cancelled) updates[a.id] = url;
        } catch {
          /* ignore */
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setThumbUrls((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assets, thumbUrls]);

  const uploaders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of assets) {
      if (a.uploaded_by_id && a.uploaded_by_name) seen.set(a.uploaded_by_id, a.uploaded_by_name);
    }
    for (const u of DEMO_USERS) seen.set(u.id, u.name);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [assets]);

  const tagsDatesCount =
    (filters.from ? 1 : 0) + (filters.to ? 1 : 0) + (filters.tags?.length ? 1 : 0);

  const activeFilterCount =
    (filters.kind && filters.kind !== "all" ? 1 : 0) +
    (filters.gkId ? 1 : 0) +
    (filters.unlinked ? 1 : 0) +
    (filters.uploaderId ? 1 : 0) +
    (filters.uploaderName ? 1 : 0) +
    tagsDatesCount;

  /** True while `assets` still belongs to a previous set of filters. */
  const stale = loadedFilters !== filters;

  const searchActive = Boolean(filters.search?.trim());
  /** Anything narrowing the library collapses the shelves into one grid. */
  const narrowed = activeFilterCount > 0 || searchActive;
  const showShelves = !narrowed && !flatView;

  const kindCounts = useMemo(() => countMediaKinds(assets), [assets]);
  const shelves = useMemo(() => buildMediaShelves(assets, rosterById), [assets, rosterById]);
  // A type filter is applied by Supabase, so the other segments would read 0
  // rather than "none here" — show counts only while the whole library is in hand.
  const showKindCounts = (filters.kind ?? "all") === "all";

  const reset = () => {
    setFilters({ kind: "all" });
    setFlatView(false);
  };

  const showGoalkeeper = !filters.gkId && !filters.unlinked;
  const flatHeading = useMemo(() => {
    if (filters.unlinked) return { title: "Unlinked", subtitle: "no goalkeeper on record" };
    if (filters.gkId) {
      const info = resolveGoalkeeper(filters.gkId, rosterById);
      return { title: info.name, subtitle: info.club };
    }
    if (!narrowed) return { title: "All media", subtitle: "newest first" };
    return { title: "Results", subtitle: null };
  }, [filters.unlinked, filters.gkId, rosterById, narrowed]);

  const goalkeeperLabel = useCallback(
    (a: MediaAsset) => (a.gk_id ? resolveGoalkeeper(a.gk_id, rosterById).name : "Unlinked"),
    [rosterById],
  );

  const handleOpen = async (a: MediaAsset) => {
    try {
      await openAsset(a, user);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (a: MediaAsset) => {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setBusyId(a.id);
    try {
      await deleteMedia(a, user);
      setAssets((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const focusShelf = (shelf: MediaShelf) => {
    setFlatView(false);
    setFilters((f) => ({
      ...f,
      gkId: shelf.gkId ?? undefined,
      // Fetch every id this goalkeeper's media may be filed under, not just the
      // one the shelf was keyed on.
      gkIds: shelf.gkIds.length > 0 ? shelf.gkIds : undefined,
      unlinked: shelf.unlinked ? true : undefined,
    }));
  };

  const renderTile = (m: MediaAsset, withGoalkeeper: boolean, className?: string) => (
    <MediaTile
      key={m.id}
      asset={m}
      goalkeeperLabel={withGoalkeeper ? goalkeeperLabel(m) : null}
      thumbUrl={thumbUrls[m.id]}
      busy={busyId === m.id}
      className={className}
      onOpen={() => handleOpen(m)}
      onEdit={canEditAsset(m, user) ? () => setEditing(m) : undefined}
      onDelete={canDeleteAsset(m, user) ? () => handleDelete(m) : undefined}
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={
          navSource ? [{ label: "Dashboard", to: "/" }, { label: navSource.label }] : undefined
        }
        title={navSource?.title ?? "Media Library"}
        description={
          loading || stale
            ? "Loading…"
            : loadError
              ? "Media could not be loaded."
              : narrowed
                ? `${assets.length} asset${assets.length === 1 ? "" : "s"} matching filters.`
                : describeLibrary(assets, rosterById)
        }
        action={
          can("media.upload") ? (
            <button
              onClick={() => setWorkflow("media")}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Upload className="size-4" />
              Upload
            </button>
          ) : null
        }
      />
      <DataSourceBanner classification="unverified" />

      <div className="sticky top-16 z-[5] -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:top-14 md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="media-search" className="sr-only">
              Search title or notes
            </label>
            <input
              id="media-search"
              value={filters.search ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search title or notes"
              className="h-9 w-full rounded-md border border-border bg-input/60 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div
            role="group"
            aria-label="Filter by media type"
            className="inline-flex items-center gap-0.5 rounded-md border border-border bg-input/40 p-0.5"
          >
            {KINDS.map((k) => {
              const active = (filters.kind ?? "all") === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilters((f) => ({ ...f, kind: k }))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {KIND_LABEL[k]}
                  {showKindCounts && (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {kindCounts[k]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <label htmlFor="media-goalkeeper" className="sr-only">
            Filter by goalkeeper
          </label>
          <select
            id="media-goalkeeper"
            value={filters.unlinked ? UNLINKED_OPTION : (filters.gkId ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              setFlatView(false);
              const picked = v && v !== UNLINKED_OPTION ? v : undefined;
              setFilters((f) => ({
                ...f,
                gkId: picked,
                gkIds: picked ? aliasesForGkId(picked, rosterById) : undefined,
                unlinked: v === UNLINKED_OPTION ? true : undefined,
              }));
            }}
            className="h-9 rounded-md border border-border bg-input/60 px-2 text-sm"
          >
            <option value="">All goalkeepers</option>
            <option value={UNLINKED_OPTION}>Unlinked only</option>
            {goalkeeperFilterOptions.map((goalkeeper) => (
              <option key={goalkeeper.id} value={goalkeeper.id}>
                {goalkeeper.name}
              </option>
            ))}
          </select>

          <label htmlFor="media-uploader" className="sr-only">
            Filter by uploader
          </label>
          <select
            id="media-uploader"
            value={filters.uploaderId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, uploaderId: e.target.value || undefined }))}
            className="h-9 rounded-md border border-border bg-input/60 px-2 text-sm"
          >
            <option value="">All uploaders</option>
            {uploaders.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setTagsDatesOpen((v) => !v)}
            aria-expanded={tagsDatesOpen}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
              tagsDatesOpen || tagsDatesCount > 0
                ? "border-primary/40 bg-primary/10 text-primary-ink"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Tags &amp; dates
            {tagsDatesCount > 0 && (
              <span className="rounded bg-primary/15 px-1 font-mono text-[10px] text-primary-ink">
                {tagsDatesCount}
              </span>
            )}
          </button>

          {(narrowed || flatView) && (
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

        {tagsDatesOpen && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-2.5">
            <div className="flex items-center gap-1.5">
              <label htmlFor="media-from" className="text-[11px] text-muted-foreground">
                From
              </label>
              <input
                id="media-from"
                type="date"
                value={filters.from?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    from: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  }))
                }
                className="h-8 rounded-md border border-border bg-input/60 px-2 text-xs"
              />
              <label htmlFor="media-to" className="text-[11px] text-muted-foreground">
                To
              </label>
              <input
                id="media-to"
                type="date"
                value={filters.to?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    to: e.target.value
                      ? new Date(e.target.value + "T23:59:59").toISOString()
                      : undefined,
                  }))
                }
                className="h-8 rounded-md border border-border bg-input/60 px-2 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {RATING_TAG_OPTIONS.map((t) => {
                const active = filters.tags?.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={Boolean(active)}
                    onClick={() =>
                      setFilters((f) => {
                        const cur = new Set(f.tags ?? []);
                        if (cur.has(t)) cur.delete(t);
                        else cur.add(t);
                        return { ...f, tags: cur.size ? Array.from(cur) : undefined };
                      })
                    }
                    className={cn(
                      "rounded border px-2 py-0.5 text-[10px] transition-colors",
                      active
                        ? "border-primary/40 bg-primary/15 text-primary-ink"
                        : "border-border text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filters.uploaderName && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Uploaded by name</span>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, uploaderName: undefined }))}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary-ink"
            >
              {filters.uploaderName}
              <X className="size-3" />
              <span className="sr-only">Remove uploader name filter</span>
            </button>
          </div>
        )}
      </div>

      {loading || stale ? (
        // `stale` matters as much as `loading` here: re-rendering the previous
        // goalkeeper's rows under the new heading is the bug, and it happens
        // while `assets.length > 0`.
        <ShelfSkeleton />
      ) : loadError ? (
        <Card>
          <EmptyState
            icon={Filter}
            title="Media could not be loaded"
            description="The library did not respond. Refresh the page to try again — nothing has been changed or deleted."
            primaryAction={
              <button
                onClick={() => void load()}
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
              >
                Try again
              </button>
            }
          />
        </Card>
      ) : assets.length === 0 ? (
        <Card>
          <EmptyState
            icon={narrowed ? Filter : Video}
            title={narrowed ? "No media matches these filters" : "No media uploaded yet"}
            description={
              narrowed
                ? "Try clearing filters or widening the date range to see more assets."
                : can("media.upload")
                  ? "Upload the first match clip, PDF report, image or voice note to build the library."
                  : "Match clips, PDFs, images and voice notes uploaded by mentors and scouts will appear here."
            }
            primaryAction={
              narrowed ? (
                <button
                  onClick={reset}
                  className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
                >
                  <X className="size-3.5" /> Reset filters
                </button>
              ) : can("media.upload") ? (
                <button
                  onClick={() => setWorkflow("media")}
                  className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
                >
                  <Upload className="size-3.5" /> Upload media
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : showShelves ? (
        <div className="space-y-8">
          {shelves.map((shelf) => (
            <section key={shelf.key} aria-label={shelf.title}>
              <ShelfHeader
                title={shelf.title}
                subtitle={shelf.subtitle}
                count={shelf.items.length}
                onViewAll={
                  shelf.key === "recently-added"
                    ? assets.length > shelf.items.length
                      ? () => setFlatView(true)
                      : undefined
                    : () => focusShelf(shelf)
                }
              />
              <ShelfTrack>
                {shelf.items.map((m) =>
                  renderTile(
                    m,
                    shelf.showsGoalkeeperOnTile,
                    "w-[168px] shrink-0 snap-start sm:w-[196px]",
                  ),
                )}
              </ShelfTrack>
            </section>
          ))}
        </div>
      ) : (
        <section aria-label={flatHeading.title}>
          <ShelfHeader
            title={flatHeading.title}
            subtitle={flatHeading.subtitle}
            count={assets.length}
          />
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {assets.map((m) => renderTile(m, showGoalkeeper))}
          </div>
        </section>
      )}

      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} />
      <EditMediaDialog asset={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
