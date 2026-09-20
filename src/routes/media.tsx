import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, Pill, EmptyState, Card } from "@/components/primitives";
import { DataSourceBanner } from "@/lib/data-classification";
import { formatDate } from "@/lib/mock-data";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Image as ImageIcon,
  Mic,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkflowDialog, type WorkflowKind, EditMediaDialog } from "@/components/workflows";
import { DEMO_USERS, useAuth } from "@/lib/auth";
import {
  listMedia,
  openAsset,
  deleteMedia,
  getSignedUrl,
  formatBytes,
  canDeleteAsset,
  canEditAsset,
  RATING_TAG_OPTIONS,
  type MediaAsset,
  type MediaKind,
  type MediaFilters,
} from "@/lib/media-store";
import {
  buildMediaShelves,
  countMediaKinds,
  describeLibrary,
  resolveGoalkeeper,
  type GoalkeeperInfo,
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

const KIND_ICON: Record<MediaKind, typeof Video> = {
  video: Video,
  pdf: FileText,
  image: ImageIcon,
  audio: Mic,
};
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
  const rosterById = useMemo(
    () =>
      new Map<string, GoalkeeperInfo>(
        rosterPlayers.map((player) => [
          player.id,
          { name: player.full_name, club: player.current_club || null },
        ]),
      ),
    [rosterPlayers],
  );
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
    setFilters((prev) => ({
      ...prev,
      from: from || undefined,
      to: to || undefined,
      uploaderName: uploaderName || undefined,
      kind: isKind(kindParam) ? kindParam : prev.kind,
    }));
  }, [from, to, uploaderName, kindParam]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await listMedia(filters));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
          loading
            ? "Loading…"
            : narrowed
              ? `${assets.length} asset${assets.length === 1 ? "" : "s"} matching filters.`
              : describeLibrary(assets)
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
              setFilters((f) => ({
                ...f,
                gkId: v && v !== UNLINKED_OPTION ? v : undefined,
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

      {loading && assets.length === 0 ? (
        <ShelfSkeleton />
      ) : !loading && assets.length === 0 ? (
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

function ShelfHeader({
  title,
  subtitle,
  count,
  onViewAll,
}: {
  title: string;
  subtitle: string | null;
  count: number;
  onViewAll?: () => void;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-display text-base font-bold uppercase tracking-[0.04em]">
          {title}
        </span>
        {subtitle && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            · {subtitle}
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all
          <ArrowRight className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * A sideways-scrolling shelf. The edge arrows are for pointer devices —
 * touch users already swipe, and the track keeps its native scrolling either way.
 */
function ShelfTrack({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const syncEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4);
  }, []);

  // No dependency list: the shelf's contents change with the filters, and
  // scrollWidth only settles after that render.
  useEffect(syncEdges);

  useEffect(() => {
    window.addEventListener("resize", syncEdges);
    return () => window.removeEventListener("resize", syncEdges);
  }, [syncEdges]);

  const nudge = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(220, el.clientWidth * 0.8) * direction;
    if (typeof el.scrollBy === "function") el.scrollBy({ left: step, behavior: "smooth" });
    else el.scrollLeft += step;
  };

  const arrow =
    "absolute top-[30%] z-[1] hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-opacity [@media(any-pointer:fine)]:grid";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Scroll shelf left"
        onClick={() => nudge(-1)}
        className={cn(arrow, "-left-2", atStart ? "pointer-events-none opacity-0" : "opacity-100")}
      >
        <ChevronLeft className="size-4" />
      </button>
      <div
        ref={trackRef}
        onScroll={syncEdges}
        className="flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll shelf right"
        onClick={() => nudge(1)}
        className={cn(arrow, "-right-2", atEnd ? "pointer-events-none opacity-0" : "opacity-100")}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function MediaTile({
  asset,
  goalkeeperLabel,
  thumbUrl,
  busy,
  className,
  onOpen,
  onEdit,
  onDelete,
}: {
  asset: MediaAsset;
  goalkeeperLabel: string | null;
  thumbUrl?: string;
  busy: boolean;
  className?: string;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const Icon = KIND_ICON[asset.media_type] ?? FileText;
  const unlinked = !asset.gk_id;
  const tags = asset.rating_tags.slice(0, 2);
  const extraTags = asset.rating_tags.length - tags.length;

  return (
    <div className={cn("group relative", className)}>
      <button
        type="button"
        onClick={onOpen}
        title={`Open ${asset.title}`}
        className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <div
          className={cn(
            "relative aspect-[4/3] overflow-hidden rounded-md border bg-gradient-to-br from-accent/30 to-muted",
            unlinked ? "border-dashed border-border" : "border-border",
          )}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={asset.title}
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
            />
          ) : asset.media_type === "audio" ? (
            <div className="absolute inset-0 grid place-items-center">
              <WaveformPlaceholder />
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <Icon className="size-9 text-muted-foreground" />
            </div>
          )}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-background/75 px-1.5 py-0.5 text-[10px] uppercase tracking-wider backdrop-blur">
            <Icon className="size-3" />
            {asset.media_type}
          </span>
          <span className="absolute bottom-1.5 right-1.5 rounded bg-background/75 px-1.5 py-0.5 font-mono text-[10px] tabular-nums backdrop-blur">
            {formatBytes(asset.file_size)}
          </span>
          <span className="absolute inset-0 bg-foreground/0 transition-colors group-hover:bg-foreground/10" />
        </div>
      </button>

      {(onEdit || onDelete) && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              title={`Edit ${asset.title}`}
              className="grid size-6 place-items-center rounded border border-border bg-background/85 text-muted-foreground backdrop-blur hover:text-foreground"
            >
              <Pencil className="size-3" />
              <span className="sr-only">Edit {asset.title}</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              title={`Delete ${asset.title}`}
              className="grid size-6 place-items-center rounded border border-border bg-background/85 text-muted-foreground backdrop-blur hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="size-3" />
              <span className="sr-only">Delete {asset.title}</span>
            </button>
          )}
        </div>
      )}

      <div className="mt-2 space-y-1">
        <p className="line-clamp-2 text-sm font-medium leading-tight">{asset.title}</p>
        {goalkeeperLabel && (
          <p className="truncate text-[11px] text-muted-foreground">{goalkeeperLabel}</p>
        )}
        <p className="truncate text-[11px] text-muted-foreground">
          {formatDate(asset.created_at)}
          {asset.uploaded_by_name ? ` · ${asset.uploaded_by_name}` : ""}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {tags.map((t) => (
              <Pill key={t} tone="info">
                {t}
              </Pill>
            ))}
            {extraTags > 0 && <Pill tone="muted">+{extraTags}</Pill>}
          </div>
        )}
      </div>
    </div>
  );
}

function ShelfSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row}>
          <div className="mb-3 h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-[168px] shrink-0 sm:w-[196px]">
                <div className="aspect-[4/3] animate-pulse rounded-md bg-muted" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted" />
                <div className="mt-1.5 h-3 w-2/5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WaveformPlaceholder() {
  const bars = Array.from({ length: 28 });
  return (
    <div className="flex h-12 items-end gap-[3px]">
      {bars.map((_, i) => {
        const h = 20 + Math.abs(Math.sin(i * 1.3)) * 70;
        return (
          <span key={i} className="w-[3px] rounded-sm bg-primary/60" style={{ height: `${h}%` }} />
        );
      })}
    </div>
  );
}
