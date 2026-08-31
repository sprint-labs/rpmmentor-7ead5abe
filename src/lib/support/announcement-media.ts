import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET } from "@/lib/storage/bucket";
import type { AnnouncementUploadTarget } from "@/lib/support/schema";

export async function uploadAnnouncementAttachment(
  file: File,
  target: AnnouncementUploadTarget,
): Promise<string> {
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .uploadToSignedUrl(target.path, target.token, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) {
    throw new Error(`Could not upload ${file.name}: ${error.message}`);
  }

  return target.path;
}
