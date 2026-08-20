import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, Card, Pill, EmptyState } from "@/components/primitives";
import { DataSourceBanner } from "@/lib/data-classification";
import { goalkeepers, getGk, formatDate } from "@/lib/mock-data";
import { Video, FileText, Image as ImageIcon, Mic, Upload, Trash2, ExternalLink, Pencil, Filter, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkflowDialog, type WorkflowKind, EditMediaDialog } from "@/components/workflows";
import { DEMO_USERS, useAuth } from "@/lib/auth";
import {
  listMedia, openAsset, deleteMedia, getSignedUrl, formatBytes,
  canDeleteAsset, canEditAsset, RATING_TAG_OPTIONS,
  type MediaAsset, type MediaKind, type MediaFilters,
} from "@/lib/media-store";
import { withPermission } from "@/components/require-permission";
import { getNavSource } from "@/lib/nav-source";
import { listPlayers } from "@/lib/players.functions";

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

const KIND_ICON: Record<MediaKind, typeof Video> = { video: Video, pdf: FileText, image: ImageIcon, audio: Mic };
const KINDS = ["all", "video", "pdf", "image", "audio"] as const;

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
  const playerNamesById = useMemo(
    () => new Map(rosterPlayers.map((player) => [player.id, player.full_name])),
    [rosterPlayers],
  );
  const { from, to, uploaderName, kind: kindParam, source } = Route.useSearch();
  const navSource = getNavSource(source);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    try { setAssets(await listMedia(filters)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
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
        } catch { /* ignore */ }
      }
      if (!cancelled && Object.keys(updates).length) {
        setThumbUrls((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [assets, thumbUrls]);

  const uploaders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of assets) {
      if (a.uploaded_by_id && a.uploaded_by_name) seen.set(a.uploaded_by_id, a.uploaded_by_name);
    }
    for (const u of DEMO_USERS) seen.set(u.id, u.name);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [assets]);

  const activeFilterCount =
    (filters.kind && filters.kind !== "all" ? 1 : 0) +
    (filters.gkId ? 1 : 0) +
    (filters.uploaderId ? 1 : 0) +
    (filters.uploaderName ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.tags?.length ? 1 : 0) +
    (filters.search?.trim() ? 1 : 0);

  const reset = () => setFilters({ kind: "all" });

  const handleOpen = async (a: MediaAsset) => {
    try { await openAsset(a, user); } catch (e) { console.error(e); }
  };

  const handleDelete = async (a: MediaAsset) => {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setBusyId(a.id);
    try {
      await deleteMedia(a, user);
      setAssets((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) { console.error(e); }
    finally { setBusyId(null); }
  };

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
        title={navSource?.title ?? "Media Library"}
        description={loading ? "Loading…" : `${assets.length} asset${assets.length === 1 ? "" : "s"} matching filters.`}
        action={can("media.upload") ? (
          <button onClick={() => setWorkflow("media")} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5">
            <Upload className="size-4" />Upload
          </button>
        ) : null}
      />
      <DataSourceBanner classification="unverified" />

      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="size-3.5" />Filters {activeFilterCount > 0 && <span className="px-1.5 rounded bg-primary/15 text-primary text-[10px]">{activeFilterCount}</span>}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={reset} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <X className="size-3" />Reset filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
          <div className="lg:col-span-2">
            <input
              value={filters.search ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search title or notes…"
              className="w-full h-9 px-3 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <select value={filters.kind ?? "all"} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value as MediaKind | "all" }))} className="h-9 px-2 rounded-md bg-input/60 border border-border text-sm">
            {KINDS.map((k) => <option key={k} value={k}>{k === "all" ? "All types" : k}</option>)}
          </select>
          <select value={filters.gkId ?? ""} onChange={(e) => setFilters((f) => ({ ...f, gkId: e.target.value || undefined }))} className="h-9 px-2 rounded-md bg-input/60 border border-border text-sm">
            <option value="">All goalkeepers</option>
            {goalkeepers.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filters.uploaderId ?? ""} onChange={(e) => setFilters((f) => ({ ...f, uploaderId: e.target.value || undefined }))} className="h-9 px-2 rounded-md bg-input/60 border border-border text-sm">
            <option value="">All uploaders</option>
            {uploaders.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={filters.uploaderName ?? ""} onChange={(e) => setFilters((f) => ({ ...f, uploaderName: e.target.value || undefined }))} className="h-9 px-2 rounded-md bg-input/60 border border-border text-sm">
            <option value="">All uploader names</option>
            {Array.from(new Set([...DEMO_USERS.map((u) => u.name), ...uploaders.map((u) => u.name)])).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <input type="date" value={filters.from?.slice(0, 10) ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} className="w-full h-9 px-2 rounded-md bg-input/60 border border-border text-xs" />
            <input type="date" value={filters.to?.slice(0, 10) ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : undefined }))} className="w-full h-9 px-2 rounded-md bg-input/60 border border-border text-xs" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {RATING_TAG_OPTIONS.map((t) => {
            const active = filters.tags?.includes(t);
            return (
              <button key={t} onClick={() => setFilters((f) => {
                const cur = new Set(f.tags ?? []);
                if (cur.has(t)) cur.delete(t); else cur.add(t);
                return { ...f, tags: cur.size ? Array.from(cur) : undefined };
              })} className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${active ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-accent/40"}`}>
                {t}
              </button>
            );
          })}
        </div>
      </Card>

      {!loading && assets.length === 0 ? (
        <Card>
          <EmptyState
            icon={activeFilterCount > 0 ? Filter : Video}
            title={activeFilterCount > 0 ? "No media matches these filters" : "No media uploaded yet"}
            description={
              activeFilterCount > 0
                ? "Try clearing filters or widening the date range to see more assets."
                : can("media.upload")
                  ? "Upload the first match clip, PDF report, image or voice note to build the library."
                  : "Match clips, PDFs, images and voice notes uploaded by mentors and scouts will appear here."
            }
            primaryAction={
              activeFilterCount > 0 ? (
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
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {assets.map((m) => {
            const Icon = KIND_ICON[m.media_type] ?? FileText;
            const goalkeeperName = m.gk_id
              ? playerNamesById.get(m.gk_id) ?? getGk(m.gk_id)?.name ?? "Unknown goalkeeper"
              : "Unlinked";
            const thumb = thumbUrls[m.id];
            return (
              <Card key={m.id} className="overflow-hidden group">
                <button onClick={() => handleOpen(m)} className="block w-full text-left">
                  <div className="aspect-video bg-gradient-to-br from-accent/40 to-muted grid place-items-center border-b border-border relative overflow-hidden">
                    {thumb ? (
                      <img src={thumb} alt={m.title} className="absolute inset-0 size-full object-cover" loading="lazy" />
                    ) : m.media_type === "audio" ? (
                      <WaveformPlaceholder />
                    ) : (
                      <Icon className="size-10 text-muted-foreground" />
                    )}
                    <div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-background/70 backdrop-blur px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                      <Icon className="size-3" />{m.media_type}
                    </div>
                    <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition bg-background/40">
                      <ExternalLink className="size-5" />
                    </div>
                  </div>
                </button>
                <div className="p-3">
                  <div className="text-sm font-medium leading-tight line-clamp-2">{m.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{goalkeeperName}</div>
                  {m.rating_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {m.rating_tags.slice(0, 3).map((t) => <Pill key={t} tone="info">{t}</Pill>)}
                      {m.rating_tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{m.rating_tags.length - 3}</span>}
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                    <span>{formatDate(m.created_at)}</span>
                    <span className="tabular-nums font-mono">{formatBytes(m.file_size)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
                    <span className="text-[10px] text-muted-foreground truncate">
                      {m.uploaded_by_name ? `by ${m.uploaded_by_name}` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {canEditAsset(m, user) && (
                        <button onClick={() => setEditing(m)} className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                          <Pencil className="size-3" />Edit
                        </button>
                      )}
                      {canDeleteAsset(m, user) && (
                        <button onClick={() => handleDelete(m)} disabled={busyId === m.id} className="text-[10px] text-muted-foreground hover:text-red-400 inline-flex items-center gap-1 disabled:opacity-50">
                          <Trash2 className="size-3" />{busyId === m.id ? "…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} />
      <EditMediaDialog asset={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function WaveformPlaceholder() {
  const bars = Array.from({ length: 28 });
  return (
    <div className="flex items-end gap-[3px] h-12">
      {bars.map((_, i) => {
        const h = 20 + Math.abs(Math.sin(i * 1.3)) * 70;
        return <span key={i} className="w-[3px] rounded-sm bg-primary/60" style={{ height: `${h}%` }} />;
      })}
    </div>
  );
}
