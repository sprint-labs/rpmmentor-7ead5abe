/**
 * Local draft persistence for the Log Interaction form.
 *
 * Purpose: if a mentor navigates away mid-entry (accidental back, tapping a
 * link, closing the sheet, refreshing), the typed context is not lost. The
 * draft is browser-local only — nothing is written to the server until Save.
 *
 * Drafts are only kept for NEW interactions. Corrections to an existing
 * interaction always start from the stored row.
 */

export interface InteractionDraft {
  gkId: string;
  type: string;
  club: string;
  date: string;
  notes: string;
  outcome: string;
  followUp: string;
  /** ISO timestamp of the last autosave. */
  savedAt: string;
}

const KEY = "rpm.interactionDraft.v1";
/** Older drafts are stale context rather than useful work. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True when the draft holds anything a user would be annoyed to lose. */
export function isDraftMeaningful(d: Omit<InteractionDraft, "savedAt">): boolean {
  return Boolean(
    d.gkId.trim() || d.notes.trim() || d.club.trim() || d.outcome.trim() || d.followUp.trim(),
  );
}

export function saveInteractionDraft(draft: Omit<InteractionDraft, "savedAt">): void {
  const store = storage();
  if (!store) return;
  if (!isDraftMeaningful(draft)) {
    clearInteractionDraft();
    return;
  }
  try {
    store.setItem(KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // Quota or private-mode failures must never break the form.
  }
}

export function loadInteractionDraft(): InteractionDraft | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<InteractionDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : "";
    const age = savedAt ? Date.now() - new Date(savedAt).getTime() : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      clearInteractionDraft();
      return null;
    }
    const draft: InteractionDraft = {
      gkId: String(parsed.gkId ?? ""),
      type: String(parsed.type ?? ""),
      club: String(parsed.club ?? ""),
      date: String(parsed.date ?? ""),
      notes: String(parsed.notes ?? ""),
      outcome: String(parsed.outcome ?? ""),
      followUp: String(parsed.followUp ?? ""),
      savedAt,
    };
    return isDraftMeaningful(draft) ? draft : null;
  } catch {
    clearInteractionDraft();
    return null;
  }
}

export function clearInteractionDraft(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    // ignore
  }
}
