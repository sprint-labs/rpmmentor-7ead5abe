import { ExternalLink, FileAudio, FileText, Paperclip } from "lucide-react";
import type { AnnouncementAttachment } from "@/lib/support/schema";
import { formatAttachmentBytes } from "@/lib/support/announcement-attachment-rules";
import { cn } from "@/lib/utils";

interface AnnouncementAttachmentsProps {
  attachments?: AnnouncementAttachment[];
  compact?: boolean;
  className?: string;
}

export function AnnouncementAttachments({
  attachments = [],
  compact = false,
  className,
}: AnnouncementAttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {attachments.map((attachment, index) => {
        const key = attachment.path || `${attachment.fileName}-${index}`;
        const details = attachment.fileSize
          ? formatAttachmentBytes(attachment.fileSize)
          : "Attachment";

        if (attachment.mimeType.startsWith("image/")) {
          return attachment.url ? (
            <a
              key={key}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-md border border-border bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={attachment.url}
                alt={attachment.fileName}
                className={cn(
                  "w-full object-contain transition-transform group-hover:scale-[1.01]",
                  compact ? "max-h-40" : "max-h-72",
                )}
              />
              <AttachmentCaption fileName={attachment.fileName} details={details} />
            </a>
          ) : (
            <UnavailableAttachment key={key} attachment={attachment} />
          );
        }

        if (attachment.mimeType.startsWith("video/")) {
          return attachment.url ? (
            <div key={key} className="overflow-hidden rounded-md border border-border bg-muted/20">
              <video
                controls
                preload="metadata"
                src={attachment.url}
                className={cn("w-full bg-black", compact ? "max-h-48" : "max-h-80")}
              />
              <AttachmentCaption fileName={attachment.fileName} details={details} />
            </div>
          ) : (
            <UnavailableAttachment key={key} attachment={attachment} />
          );
        }

        if (attachment.mimeType.startsWith("audio/")) {
          return (
            <div key={key} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-start gap-2">
                <FileAudio className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{attachment.fileName}</div>
                  <div className="text-[10px] text-muted-foreground">{details}</div>
                </div>
              </div>
              {attachment.url ? (
                <audio controls preload="metadata" src={attachment.url} className="mt-2 h-9 w-full" />
              ) : (
                <div className="mt-2 text-[11px] text-muted-foreground">Preview unavailable.</div>
              )}
            </div>
          );
        }

        return attachment.url ? (
          <a
            key={key}
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {attachment.mimeType === "application/pdf" ? (
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{attachment.fileName}</div>
              <div className="text-[10px] text-muted-foreground">{details}</div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ) : (
          <UnavailableAttachment key={key} attachment={attachment} />
        );
      })}
    </div>
  );
}

function AttachmentCaption({ fileName, details }: { fileName: string; details: string }) {
  return (
    <div className="flex items-center gap-2 border-t border-border px-2.5 py-2">
      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium">{fileName}</div>
        <div className="text-[10px] text-muted-foreground">{details}</div>
      </div>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </div>
  );
}

function UnavailableAttachment({ attachment }: { attachment: AnnouncementAttachment }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5">
      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{attachment.fileName}</div>
        <div className="text-[10px] text-muted-foreground">Preview unavailable.</div>
      </div>
    </div>
  );
}
