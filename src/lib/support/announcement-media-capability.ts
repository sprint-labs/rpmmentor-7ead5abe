import { ANNOUNCEMENT_ATTACHMENT_UNAVAILABLE_MESSAGE } from "./schema";

export const ANNOUNCEMENT_MEDIA_STORAGE_READINESS_RPC =
  "announcement_media_storage_ready_v2" as const;

type ReadinessResponse = {
  data: boolean | null;
  error: unknown;
};

type InvokeReadinessRpc = (
  name: typeof ANNOUNCEMENT_MEDIA_STORAGE_READINESS_RPC,
) => PromiseLike<ReadinessResponse>;

/** Fail closed unless the final hardening-migration marker returns literal true. */
export async function requireAnnouncementMediaStorageReady(
  invoke: InvokeReadinessRpc,
): Promise<void> {
  try {
    const { data, error } = await invoke(ANNOUNCEMENT_MEDIA_STORAGE_READINESS_RPC);
    if (!error && data === true) return;
  } catch {
    // Missing migrations, stale API schemas and network failures all deny use.
  }

  throw new Error(ANNOUNCEMENT_ATTACHMENT_UNAVAILABLE_MESSAGE);
}
