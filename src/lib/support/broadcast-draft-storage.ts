import type { AnnouncementKind } from "./schema";

const BROADCAST_DRAFT_STORAGE_KEY = "rpm-broadcast-draft-v2";

export type BroadcastDraft = {
  kind: AnnouncementKind;
  title: string;
  body: string;
  publishMode: "now" | "later";
  startsAt: string;
  expiryMode: "none" | "24h" | "7d" | "custom";
  endsAt: string;
};

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
