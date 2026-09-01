import type { AnnouncementKind } from "./schema";

const BROADCAST_DRAFT_STORAGE_KEY = "rpm-broadcast-draft-v2";

export type BroadcastScheduleTimeSource = "auto" | "draft" | "user";

export type BroadcastDraft = {
  kind: AnnouncementKind;
  title: string;
  body: string;
  publishMode: "now" | "later";
  startsAt: string;
  scheduleTimeSource?: Exclude<BroadcastScheduleTimeSource, "draft">;
  expiryMode: "none" | "24h" | "7d" | "custom";
  endsAt: string;
};

export function restoreBroadcastScheduleTime(draft: Partial<BroadcastDraft>): {
  startsAt: string;
  source: BroadcastScheduleTimeSource;
} {
  const startsAt = typeof draft.startsAt === "string" ? draft.startsAt : "";
  if (draft.scheduleTimeSource === "auto") return { startsAt: "", source: "auto" };
  if (draft.scheduleTimeSource === "user") return { startsAt, source: "user" };
  // Drafts saved before the source marker existed only need their hidden
  // baseline preserved when the author had explicitly chosen scheduling.
  if (draft.publishMode === "later" && startsAt) return { startsAt, source: "draft" };
  return { startsAt: "", source: "auto" };
}

export type BroadcastDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function draftStorage(storage?: BroadcastDraftStorage): BroadcastDraftStorage {
  return storage ?? window.localStorage;
}

export function readBroadcastDraft(
  storage?: BroadcastDraftStorage,
): Partial<BroadcastDraft> | null {
  try {
    const raw = draftStorage(storage).getItem(BROADCAST_DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      removeBroadcastDraft(storage);
      return null;
    }
    return parsed as Partial<BroadcastDraft>;
  } catch {
    removeBroadcastDraft(storage);
    return null;
  }
}

export function writeBroadcastDraft(draft: BroadcastDraft, storage?: BroadcastDraftStorage): void {
  try {
    draftStorage(storage).setItem(BROADCAST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Draft persistence is optional; a blocked or full store must not break the composer.
  }
}

export function removeBroadcastDraft(storage?: BroadcastDraftStorage): void {
  try {
    draftStorage(storage).removeItem(BROADCAST_DRAFT_STORAGE_KEY);
  } catch {
    // Clearing the composer must still work when localStorage is unavailable.
  }
}
