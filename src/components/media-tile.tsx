import { FileText, Image as ImageIcon, Mic, Pencil, Trash2, Video } from "lucide-react";
import { Pill } from "@/components/primitives";
import { formatDate } from "@/lib/mock-data";
import { formatBytes, type MediaAsset, type MediaKind } from "@/lib/media-store";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<MediaKind, typeof Video> = {
  video: Video,
  pdf: FileText,
  image: ImageIcon,
  audio: Mic,
};

/**
 * One media file as a card: 4:3 art, type and size over it, title, optional
 * goalkeeper, date and uploader, rating tags. Shared by the Media Library and
 * Match Clips so a clip looks the same wherever it is listed.
 */
export function MediaTile({
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

export function WaveformPlaceholder() {
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
