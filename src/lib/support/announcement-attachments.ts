import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET } from "@/lib/storage/bucket";
import {
  ANNOUNCEMENT_ATTACHMENT_MAX_BYTES,
  type AnnouncementAttachment,
} from "@/lib/support/schema";

export const ANNOUNCEMENT_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/x-m4a,audio/aac,application/pdf";

const ACCEPTED_MIME_TYPES = new Set(ANNOUNCEMENT_ATTACHMENT_ACCEPT.split(","));
const ACCEPTED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "mp4",
  "mov",
  "webm",
  "mp3",
  "m4a",
  "wav",
  "aac",
  "pdf",
]);

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = fileExtension(file.name);
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    aac: "audio/aac",
    pdf: "application/pdf",
  };
  return byExtension[extension] ?? "application/octet-stream";
}

function safeFileName(name: string): string {
  const normalised = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (normalised || "attachment").slice(-140);
}

export function announcementAttachmentError(file: File): string | null {
  const extension = fileExtension(file.name);
  if (!ACCEPTED_MIME_TYPES.has(file.type) && !ACCEPTED_EXTENSIONS.has(extension)) {
    return "Use an image, MP4, MOV, WebM, audio file or PDF.";
  }
  if (file.size > ANNOUNCEMENT_ATTACHMENT_MAX_BYTES) {
    return "Attachments must be 25 MB or smaller.";
  }
  return null;
}

export async function uploadAnnouncementAttachment(file: File): Promise<AnnouncementAttachment> {
  const validationError = announcementAttachmentError(file);
  if (validationError) throw new Error(validationError);

  const name = safeFileName(file.name);
  const path = `announcements/${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${name}`;
  const mime = inferMimeType(file);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`Could not upload attachment: ${error.message}`);

  return {
    path,
    name: file.name,
    mime,
    size: file.size,
  };
}

export async function removeAnnouncementAttachment(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) console.warn("Could not remove unused broadcast attachment", error);
}
