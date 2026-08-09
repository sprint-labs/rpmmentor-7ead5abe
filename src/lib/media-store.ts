import { supabase } from "@/integrations/supabase/client";
import type { SessionUser } from "@/lib/auth";
import { attachmentLookupIds, mergeAttachments } from "@/lib/report-attachments";
import { MEDIA_BUCKET } from "@/lib/storage/bucket";

export { attachmentLookupIds, mergeAttachments };

export type MediaKind = "video" | "pdf" | "image" | "audio";

export interface MediaAsset {
  id: string;
  gk_id: string;
  title: string;
  notes: string | null;
  media_type: MediaKind;
  mime_type: string | null;
  file_path: string;
  file_size: number | null;
  thumbnail_path: string | null;
  rating_tags: string[];
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  uploaded_by_role: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaAuditEntry {
  id: string;
  created_at: string;
  action: "upload" | "open" | "edit" | "delete" | string;
  media_id: string | null;
  media_title: string | null;
  gk_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown>;
}

export interface ReportAttachment {
  id: string;
  report_id: string;
  media_id: string;
  created_at: string;
  attached_by_id: string | null;
  attached_by_name: string | null;
}

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const BUCKET = MEDIA_BUCKET;

export const ACCEPT_BY_KIND: Record<MediaKind, string> = {
  video: "video/mp4,video/quicktime,video/webm,video/x-matroska",
  pdf: "application/pdf",
  image: "image/jpeg,image/png,image/webp,image/gif",
  audio: "audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/x-m4a,audio/aac",
};

export const RATING_TAG_OPTIONS = [
  "Highlight",
  "Coaching point",
  "Strength",
  "Weakness",
  "Match-winning",
  "Set piece",
  "Distribution",
  "1v1",
  "Aerial",
  "Review priority",
] as const;

export function detectKind(file: File): MediaKind | null {
  const t = file.type;
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t === "application/pdf") return "pdf";
  return null;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

// ---------- Thumbnail generation ----------

async function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.72): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

function drawScaled(source: CanvasImageSource, sw: number, sh: number, max = 640): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(source, 0, 0, w, h);
  return c;
}

async function imageThumb(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("image load failed"));
      i.src = url;
    });
    return await canvasToBlob(drawScaled(img, img.naturalWidth, img.naturalHeight));
  } catch { return null; }
  finally { URL.revokeObjectURL(url); }
}

async function videoThumb(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("video metadata failed"));
    });
    const seekTo = Math.min(1.2, Math.max(0, (video.duration || 2) * 0.1));
    await new Promise<void>((res, rej) => {
      video.onseeked = () => res();
      video.onerror = () => rej(new Error("video seek failed"));
      try { video.currentTime = seekTo; } catch (e) { rej(e as Error); }
    });
    return await canvasToBlob(drawScaled(video, video.videoWidth, video.videoHeight));
  } catch { return null; }
  finally { URL.revokeObjectURL(url); }
}

async function generateThumbnail(file: File, kind: MediaKind): Promise<Blob | null> {
  if (kind === "image") return imageThumb(file);
  if (kind === "video") return videoThumb(file);
  return null; // pdf & audio use icon/waveform placeholder cards
}

// ---------- Audit log ----------

export async function logAudit(entry: {
  action: MediaAuditEntry["action"];
  asset?: Pick<MediaAsset, "id" | "title" | "gk_id"> | null;
  user: SessionUser | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from("media_audit_log").insert({
      action: entry.action,
      media_id: entry.asset?.id ?? null,
      media_title: entry.asset?.title ?? null,
      gk_id: entry.asset?.gk_id ?? null,
      actor_id: entry.user?.id ?? null,
      actor_name: entry.user?.name ?? null,
      actor_role: entry.user?.role ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
  } catch (e) {
    console.warn("audit log failed", e);
  }
}

export async function listAuditLog(limit = 200): Promise<MediaAuditEntry[]> {
  const { data, error } = await supabase
    .from("media_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as MediaAuditEntry[];
}

// ---------- Upload / list / signed URLs ----------

/**
 * Upload the object bytes with real byte-level progress.
 *
 * supabase-js uses `fetch`, which cannot report upload progress, so when a
 * caller wants a progress indicator we send the same authenticated request via
 * XHR (the only browser API that emits `upload.onprogress`). Any environment
 * without XHR — SSR, tests — falls back to the normal client call.
 */
async function uploadObject(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const anonKey = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];

  // Storage RLS only admits requests that arrive as `authenticated`. An expired
  // or missing session reaches Postgres as `anon` and fails with an opaque
  // "violates row-level security policy" error, so refresh first and, if there
  // is genuinely no session, say so in words the user can act on.
  const token = await currentAccessToken();
  if (!token) {
    throw new Error("Upload failed: your session has expired. Sign in again and retry.");
  }

  if (!onProgress || typeof XMLHttpRequest === "undefined" || !url || !anonKey) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return;
  }


  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/${BUCKET}/${encodeURI(path)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      let message = `HTTP ${xhr.status}`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        /* keep the status-code message */
      }
      reject(new Error(`Upload failed: ${message}`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: the network connection dropped."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export async function uploadMedia(opts: {
  file: File;
  gkId: string;
  title: string;
  notes?: string;
  kind: MediaKind;
  ratingTags?: string[];
  user: SessionUser;
  /** Receives 0–1 as the bytes go up. Enables the XHR progress path. */
  onProgress?: (fraction: number) => void;
}): Promise<MediaAsset> {
  const { file, gkId, title, notes, kind, ratingTags, user, onProgress } = opts;

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File exceeds the 200MB upload limit.");
  }

  const path = `${gkId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitizeName(file.name)}`;

  await uploadObject(path, file, onProgress);


  // Best-effort thumbnail
  let thumbPath: string | null = null;
  try {
    const thumb = await generateThumbnail(file, kind);
    if (thumb) {
      thumbPath = `${gkId}/thumbs/${crypto.randomUUID()}.jpg`;
      const { error: tErr } = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, {
        contentType: "image/jpeg", upsert: false,
      });
      if (tErr) thumbPath = null;
    }
  } catch { thumbPath = null; }

  const { data, error: dbErr } = await supabase
    .from("media_assets")
    .insert({
      gk_id: gkId,
      title,
      notes: notes || null,
      media_type: kind,
      mime_type: file.type || null,
      file_path: path,
      file_size: file.size,
      thumbnail_path: thumbPath,
      rating_tags: ratingTags ?? [],
      uploaded_by_id: user.id,
      uploaded_by_name: user.name,
      uploaded_by_role: user.role,
    })
    .select("*")
    .single();

  if (dbErr) {
    await supabase.storage.from(BUCKET).remove([path, ...(thumbPath ? [thumbPath] : [])]);
    throw new Error(`Could not save media record: ${dbErr.message}`);
  }
  const asset = data as MediaAsset;
  await logAudit({ action: "upload", asset, user, metadata: { size: file.size, kind } });
  return asset;
}

export interface MediaFilters {
  kind?: MediaKind | "all";
  gkId?: string;
  uploaderId?: string;
  uploaderName?: string;
  from?: string; // ISO date
  to?: string;   // ISO date
  tags?: string[];
  search?: string;
}

export async function listMedia(filters: MediaFilters = {}): Promise<MediaAsset[]> {
  let q = supabase.from("media_assets").select("*").order("created_at", { ascending: false });
  if (filters.kind && filters.kind !== "all") q = q.eq("media_type", filters.kind);
  if (filters.gkId) q = q.eq("gk_id", filters.gkId);
  if (filters.uploaderId) q = q.eq("uploaded_by_id", filters.uploaderId);
  if (filters.uploaderName) q = q.ilike("uploaded_by_name", `%${filters.uploaderName}%`);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  if (filters.tags && filters.tags.length) q = q.overlaps("rating_tags", filters.tags);
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().replace(/[%,]/g, " ");
    q = q.or(`title.ilike.%${s}%,notes.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as MediaAsset[];
}

export async function getMediaByIds(ids: string[]): Promise<MediaAsset[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("media_assets").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return (data || []) as MediaAsset[];
}

export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function openAsset(asset: MediaAsset, user: SessionUser | null) {
  const url = await getSignedUrl(asset.file_path);
  await logAudit({ action: "open", asset, user });
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function updateMedia(
  id: string,
  patch: Partial<Pick<MediaAsset, "title" | "notes" | "media_type" | "gk_id" | "rating_tags">>,
  user: SessionUser | null,
  before?: MediaAsset,
): Promise<MediaAsset> {
  const { data, error } = await supabase
    .from("media_assets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const asset = data as MediaAsset;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (before) {
    (Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => {
      if (JSON.stringify(before[k]) !== JSON.stringify((asset as MediaAsset)[k])) {
        changes[k as string] = { from: before[k] as unknown, to: (asset as MediaAsset)[k] as unknown };
      }
    });
  }
  await logAudit({ action: "edit", asset, user, metadata: { changes } });
  return asset;
}

export async function deleteMedia(asset: MediaAsset, user: SessionUser | null): Promise<void> {
  const paths = [asset.file_path, ...(asset.thumbnail_path ? [asset.thumbnail_path] : [])];
  await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
  if (error) throw new Error(error.message);
  await logAudit({ action: "delete", asset, user });
}

// ---------- Permission helpers ----------

export function canEditAsset(asset: MediaAsset, user: SessionUser | null): boolean {
  if (!user) return false;
  if (user.role === "super_admin" || user.role === "admin" || user.role === "mentor_manager") return true;
  if (asset.uploaded_by_id && asset.uploaded_by_id === user.id) return true;
  return false;
}

export function canDeleteAsset(asset: MediaAsset, user: SessionUser | null): boolean {
  if (!user) return false;
  if (user.role === "super_admin" || user.role === "admin") return true;
  return !!asset.uploaded_by_id && asset.uploaded_by_id === user.id;
}

// ---------- Report attachments ----------

export async function listReportAttachments(reportId: string): Promise<MediaAsset[]> {
  return listReportAttachmentsForIds([reportId]);
}

/**
 * Load attachments for one report across ALL of its historical identities.
 *
 * Live data holds legacy `mr_` attachment rows while list/detail identities are
 * now `mr2_`. Querying only the current id hides existing attached media, so we
 * fetch every known id (current + legacy) and dedupe.
 */
export async function listReportAttachmentsForIds(reportIds: (string | null | undefined)[]): Promise<MediaAsset[]> {
  const ids = attachmentLookupIds(...reportIds);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("report_attachments")
    .select("media_id, media_assets:media_id(*)")
    .in("report_id", ids);
  if (error) throw new Error(error.message);
  const assets = ((data || []) as Array<{ media_assets: unknown }>)
    .map((row) => row.media_assets as MediaAsset | null)
    .filter((x): x is MediaAsset => !!x);
  return mergeAttachments(assets);
}


export async function attachMediaToReport(
  reportId: string,
  mediaIds: string[],
  user: SessionUser | null,
): Promise<void> {
  if (!mediaIds.length) return;
  const rows = mediaIds.map((media_id) => ({
    report_id: reportId,
    media_id,
    attached_by_id: user?.id ?? null,
    attached_by_name: user?.name ?? null,
  }));
  const { error } = await supabase
    .from("report_attachments")
    .upsert(rows, { onConflict: "report_id,media_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function detachMediaFromReport(reportId: string, mediaId: string): Promise<void> {
  const { error } = await supabase
    .from("report_attachments")
    .delete()
    .eq("report_id", reportId)
    .eq("media_id", mediaId);
  if (error) throw new Error(error.message);
}
