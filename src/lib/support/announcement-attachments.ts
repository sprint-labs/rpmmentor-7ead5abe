import { supabase } from "@/integrations/supabase/client";
import { getUploadAccessToken } from "@/lib/media-store";
import {
  describeUploadError,
  formatFileLimit,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  uploadObjectBytes,
} from "@/lib/media-upload-transport";
import { MEDIA_BUCKET } from "@/lib/storage/bucket";
import { requireAnnouncementMediaStorageReady } from "@/lib/support/announcement-media-capability";
import {
  ANNOUNCEMENT_ATTACHMENT_MIME_BY_EXTENSION,
  ANNOUNCEMENT_ATTACHMENT_MAX_BYTES,
  isAnnouncementAttachmentTypeAllowed,
  type AnnouncementAttachment,
} from "@/lib/support/schema";

export { ANNOUNCEMENT_ATTACHMENT_ACCEPT } from "@/lib/support/schema";

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function announcementAttachmentMime(file: File): string {
  if (file.type) return file.type;
  const extension = fileExtension(file.name);
  const accepted =
    ANNOUNCEMENT_ATTACHMENT_MIME_BY_EXTENSION[
      extension as keyof typeof ANNOUNCEMENT_ATTACHMENT_MIME_BY_EXTENSION
    ];
  return accepted?.[0] ?? "application/octet-stream";
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
  if (!isAnnouncementAttachmentTypeAllowed(file.name, announcementAttachmentMime(file))) {
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

  // Storage uses the caller's browser session. Positively confirm that the
  // hardening migration has replaced the legacy broad policies before deriving
  // a path, fetching an upload token or sending any bytes.
  await requireAnnouncementMediaStorageReady((name) => supabase.rpc(name));

  const name = safeFileName(file.name);
  const path = `announcements/${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${name}`;
  const mime = announcementAttachmentMime(file);
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const anonKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  const limitLabel = formatFileLimit(ANNOUNCEMENT_ATTACHMENT_MAX_BYTES);

  if (!url || !anonKey) {
    throw new Error("Upload failed: storage is not configured.");
  }

  const token = await getUploadAccessToken(file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES);
  if (!token) {
    throw new Error("Your session has expired. Sign in again and retry this upload.");
  }

  const uploadFile = file.type ? file : new File([file], file.name, { type: mime });

  await uploadObjectBytes({
    path,
    file: uploadFile,
    accessToken: token,
    getAccessToken: async () => {
      const next = await getUploadAccessToken(false);
      if (!next) {
        throw new Error("Your session has expired. Sign in again and retry this upload.");
      }
      return next;
    },
    supabaseUrl: url,
    anonKey,
    bucket: MEDIA_BUCKET,
    limitLabel,
    standardUpload: async (objectPath, objectFile) => {
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, objectFile, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw new Error(describeUploadError(error, limitLabel));
    },
  });

  return {
    path,
    name: file.name,
    mime,
    size: file.size,
  };
}

/** Remove a freshly uploaded object only while no create request has begun. */
export async function removeUnlinkedAnnouncementAttachment(
  attachment: AnnouncementAttachment,
): Promise<void> {
  if (!attachment.path.startsWith("announcements/")) return;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([attachment.path]);
  if (error) throw new Error(error.message);
}
