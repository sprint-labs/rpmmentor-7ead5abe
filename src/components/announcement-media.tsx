import { useEffect, useState } from "react";
import {
  ExternalLink,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET } from "@/lib/storage/bucket";
import type { AnnouncementAttachment, AnnouncementKind } from "@/lib/support/schema";
import { cn } from "@/lib/utils";

export const ANNOUNCEMENT_KIND_LABEL: Record<AnnouncementKind, string> = {
  feature: "New feature",
  info: "Update",
  incident: "Incident",
  downtime: "Downtime",
};

export const ANNOUNCEMENT_KIND_DESCRIPTION: Record<AnnouncementKind, string> = {
  feature: "A new feature or workflow for users",
  info: "General product or operational information",
  incident: "An active service issue users should know about",
  downtime: "Planned or active service downtime",
};

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentKind(mime: string): "image" | "video" | "audio" | "pdf" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "file";
}

function AttachmentIcon({ mime }: { mime: string }) {
  const kind = attachmentKind(mime);
  if (kind === "image") return <ImageIcon className="size-4" aria-hidden="true" />;
  if (kind === "video") return <Video className="size-4" aria-hidden="true" />;
  if (kind === "audio") return <FileAudio className="size-4" aria-hidden="true" />;
  if (kind === "pdf") return <FileText className="size-4" aria-hidden="true" />;
  return <Paperclip className="size-4" aria-hidden="true" />;
}

export function AnnouncementMedia({
  attachment,
  previewUrl,
  compact = false,
  className,
}: {
  attachment: AnnouncementAttachment | null | undefined;
  previewUrl?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(previewUrl ?? null);

  useEffect(() => {
    if (!attachment) {
      setSignedUrl(null);
      return;
    }
    if (previewUrl) {
      setSignedUrl(previewUrl);
      return;
    }

    let cancelled = false;
    setSignedUrl(null);
    void supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(attachment.path, 60 * 60)
      .then(({ data, error }) => {
        if (!cancelled && !error) setSignedUrl(data.signedUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, previewUrl]);

  if (!attachment) return null;

  const kind = attachmentKind(attachment.mime);
  const url = previewUrl ?? signedUrl;
  const mediaClass = compact ? "max-h-44" : "max-h-72";

  if (kind === "image" && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn("mt-3 block overflow-hidden rounded-md border border-border", className)}
        aria-label={`Open ${attachment.name}`}
      >
        <img
          src={url}
          alt={attachment.name}
          className={cn("w-full object-cover", mediaClass)}
        />
      </a>
    );
  }

  if (kind === "video" && url) {
    return (
      <video
        controls
        preload="metadata"
        src={url}
        className={cn(
          "mt-3 w-full rounded-md border border-border bg-black object-contain",
          mediaClass,
          className,
        )}
      >
        Your browser cannot play this video.
      </video>
    );
  }

  if (kind === "audio" && url) {
    return (
      <audio
        controls
        preload="metadata"
        src={url}
        className={cn("mt-3 w-full", className)}
      >
        Your browser cannot play this audio.
      </audio>
    );
  }

  const contents = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <AttachmentIcon mime={attachment.mime} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{attachment.name}</span>
        <span className="block text-[10px] text-muted-foreground">
          {formatAttachmentSize(attachment.size)}
        </span>
      </span>
      {url && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );

  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2 hover:bg-muted/40",
        className,
      )}
    >
      {contents}
    </a>
  ) : (
    <div
      className={cn(
        "mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2",
        className,
      )}
    >
      {contents}
    </div>
  );
}
