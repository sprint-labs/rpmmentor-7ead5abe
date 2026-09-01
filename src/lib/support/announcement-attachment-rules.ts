export const MAX_ANNOUNCEMENT_ATTACHMENTS = 1;
export const MAX_ANNOUNCEMENT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const ANNOUNCEMENT_ATTACHMENT_PATH_PREFIX = "announcements/";

export const ANNOUNCEMENT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/aac",
  "application/pdf",
] as const;

export const ANNOUNCEMENT_ATTACHMENT_ACCEPT = ANNOUNCEMENT_ATTACHMENT_MIME_TYPES.join(",");

const MIME_TYPE_SET = new Set<string>(ANNOUNCEMENT_ATTACHMENT_MIME_TYPES);

export function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateAnnouncementAttachment(input: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!MIME_TYPE_SET.has(input.type)) {
    return `${input.name} is not a supported image, video, audio or PDF file.`;
  }

  if (input.size <= 0) {
    return `${input.name} is empty.`;
  }

  if (input.size > MAX_ANNOUNCEMENT_ATTACHMENT_BYTES) {
    return `${input.name} is larger than ${formatAttachmentBytes(MAX_ANNOUNCEMENT_ATTACHMENT_BYTES)}.`;
  }

  return null;
}

export function sanitiseAnnouncementFileName(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return cleaned || "attachment";
}

export function buildAnnouncementObjectName(fileName: string, uniqueId: string): string {
  return `${uniqueId}__${sanitiseAnnouncementFileName(fileName)}`;
}

export function originalAnnouncementFileName(objectName: string): string {
  const separator = objectName.indexOf("__");
  if (separator === -1) return objectName;
  return objectName.slice(separator + 2) || "attachment";
}

/** Canonical attachment from Super Admin-written announcement columns, never from a storage listing. */
export function attachmentFromAnnouncementColumns(input: {
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
}): { path: string; fileName: string; mimeType: string; fileSize: number } | null {
  if (
    !input.attachment_path ||
    !input.attachment_name ||
    !input.attachment_mime ||
    input.attachment_size === null
  ) {
    return null;
  }

  return {
    path: input.attachment_path,
    fileName: input.attachment_name,
    mimeType: input.attachment_mime,
    fileSize: input.attachment_size,
  };
}
