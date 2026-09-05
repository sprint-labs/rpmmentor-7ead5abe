import { ANNOUNCEMENT_ATTACHMENT_MAX_BYTES, type AnnouncementAttachment } from "./schema";

type StoredObjectInfo = {
  size?: number;
  contentType?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  };
};

type StoredObjectInfoResult = {
  data: StoredObjectInfo | null;
  error: { message?: string } | null;
};

type ReadStoredObjectInfo = (path: string) => PromiseLike<StoredObjectInfoResult>;

/**
 * Verify system metadata recorded by Storage, rather than trusting attachment
 * metadata supplied by the browser. A failed check leaves an unlinked private
 * object, but can never expose it through an announcement.
 */
export async function verifyStoredAnnouncementAttachment(
  attachment: AnnouncementAttachment,
  readInfo: ReadStoredObjectInfo,
): Promise<void> {
  const { data, error } = await readInfo(attachment.path);
  if (error || !data) {
    throw new Error(error?.message ?? "Could not verify the uploaded attachment.");
  }

  const actualSize = data.size ?? data.metadata?.size;
  if (actualSize == null || !Number.isSafeInteger(actualSize) || actualSize < 0) {
    throw new Error("Could not verify the uploaded attachment size.");
  }
  if (actualSize > ANNOUNCEMENT_ATTACHMENT_MAX_BYTES) {
    throw new Error("The uploaded attachment exceeds the 25 MB limit.");
  }
  if (actualSize !== attachment.size) {
    throw new Error("The uploaded attachment size does not match the submitted file.");
  }

  const actualMime = (data.contentType ?? data.metadata?.mimetype)
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!actualMime || actualMime !== attachment.mime) {
    throw new Error("The uploaded attachment type does not match the submitted file.");
  }
}
