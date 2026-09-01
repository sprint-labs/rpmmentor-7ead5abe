import {
  resolveBroadcastWindow,
  type BroadcastWindowDraft,
  type ResolvedBroadcastWindow,
} from "./broadcast-window";
import type { AnnouncementAttachment } from "./schema";

/**
 * Revalidate delivery after an upload, while it is still safe to remove the
 * unlinked object. Once submit begins its result can be ambiguous, so errors
 * from submit must never trigger cleanup here.
 */
export async function submitBroadcastAfterUpload<T>({
  draft,
  attachment,
  removeAttachment,
  submit,
  nowMs = Date.now(),
}: {
  draft: BroadcastWindowDraft;
  attachment: AnnouncementAttachment | null;
  removeAttachment: (attachment: AnnouncementAttachment) => Promise<void>;
  submit: (delivery: ResolvedBroadcastWindow) => Promise<T>;
  nowMs?: number;
}): Promise<T> {
  let delivery: ResolvedBroadcastWindow;
  try {
    delivery = resolveBroadcastWindow(draft, nowMs);
  } catch (error) {
    if (attachment) {
      try {
        await removeAttachment(attachment);
      } catch {
        // Keep the original delivery-window error. Hardened storage keeps a
        // failed-cleanup orphan private until routine maintenance removes it.
      }
    }
    throw error;
  }

  return submit(delivery);
}
