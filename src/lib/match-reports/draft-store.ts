/**
 * localStorage-backed draft persistence for the Match Report form.
 *
 * - One draft slot per signed-in user (key: rpm.report-draft.v2.<userId>)
 * - Autosaved with a 5s debounce from ReportForm
 * - Discarded on successful submit or manual "Discard draft"
 * - 30-day retention
 * - Versioned so concurrent edits from two tabs raise a conflict
 *
 * Versioning model
 * ----------------
 * Each stored draft carries `{ version, tabId, savedAt }`. When a tab saves
 * it passes the `expectedVersion` it last observed. If the persisted draft
 * has a newer version written by a different `tabId`, `saveDraft` returns
 * `{ ok: false, conflict }` and the caller must resolve.
 *
 * Cross-tab notification uses the native `storage` event; subscribers get
 * the newly-persisted draft and can compare `tabId` to detect remote writes.
 */
import type { PillarId } from "./schema";

export interface TranscriptVersion {
  /** ISO timestamp when this version was captured. */
  at: string;
  /** The transcript text at this point in time. */
  text: string;
  /** Where the version came from. */
  source: "ai" | "edit" | "saved";
  /** Optional short label (e.g. "AI original", "Auto-saved edit"). */
  label?: string;
}

export interface VoiceTranscriptDraft {
  transcript: string;
  tokens: Array<{ token: string; confidence: number }>;
  avgConfidence: number | null;
  reviewed: boolean;
  /** Editable AI rewrite for Match Reports, when one has been generated. */
  rewrite?: string | null;
  /** The AI-generated transcript, preserved verbatim for auditability. */
  original?: TranscriptVersion | null;
  /** Ordered list of subsequent versions (edits + saves), oldest first. */
  versions?: TranscriptVersion[];
}

export interface ReportDraftSnapshot {
  goalkeeper: string;
  coach: string;
  competition: string;
  team: string;
  opponent: string;
  matchDate: string;
  scores: Record<PillarId, number>;
  comments: string;
  selectedMedia: string[];
  voiceTranscript?: VoiceTranscriptDraft | null;
}

export interface ReportDraft extends ReportDraftSnapshot {
  version: number;
  tabId: string;
  savedAt: string; // ISO
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const KEY_PREFIX = "rpm.report-draft.v2.";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** One-per-mount tab identifier for conflict detection. */
export function newTabId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function readRaw(userId: string): ReportDraft | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReportDraft>;
    if (!parsed.savedAt || typeof parsed.version !== "number") return null;
    if (Date.now() - new Date(parsed.savedAt).getTime() > RETENTION_MS) {
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    return parsed as ReportDraft;
  } catch {
    return null;
  }
}

export function loadDraft(userId: string): ReportDraft | null {
  return readRaw(userId);
}

export type SaveResult =
  | { ok: true; savedAt: string; version: number }
  | { ok: false; conflict: ReportDraft }
  | { ok: false; error: string };

export type OverwriteResult =
  { ok: true; savedAt: string; version: number } | { ok: false; error: string };

/**
 * Save with optimistic version check. Pass `expectedVersion = 0` for a
 * first-time save. If the on-disk draft has advanced beyond
 * `expectedVersion` from a different `tabId`, the call is refused and the
 * remote draft is returned as `conflict` for the UI to resolve.
 */
export function saveDraft(
  userId: string,
  tabId: string,
  expectedVersion: number,
  snapshot: ReportDraftSnapshot,
): SaveResult {
  const now = new Date().toISOString();
  if (!isBrowser()) {
    return { ok: true, savedAt: now, version: expectedVersion + 1 };
  }
  const current = readRaw(userId);
  if (current && current.version > expectedVersion && current.tabId !== tabId) {
    return { ok: false, conflict: current };
  }
  const nextVersion = Math.max(current?.version ?? 0, expectedVersion) + 1;
  const draft: ReportDraft = { ...snapshot, version: nextVersion, tabId, savedAt: now };
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(draft));
  } catch {
    return { ok: false, error: "Could not save draft — localStorage may be full or unavailable." };
  }
  return { ok: true, savedAt: now, version: nextVersion };
}

/** Force-overwrite the stored draft (used when the user chooses "Keep mine"). */
export function overwriteDraft(
  userId: string,
  tabId: string,
  snapshot: ReportDraftSnapshot,
): OverwriteResult {
  const current = readRaw(userId);
  const nextVersion = (current?.version ?? 0) + 1;
  const now = new Date().toISOString();
  if (isBrowser()) {
    const draft: ReportDraft = { ...snapshot, version: nextVersion, tabId, savedAt: now };
    try {
      window.localStorage.setItem(keyFor(userId), JSON.stringify(draft));
    } catch {
      return {
        ok: false,
        error: "Could not save draft — localStorage may be full or unavailable.",
      };
    }
  }
  return { ok: true, savedAt: now, version: nextVersion };
}

export function clearDraft(userId: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to cross-tab draft changes for the given user. The callback
 * receives the newly-persisted draft (or `null` if it was cleared). Only
 * fires for writes from *other* tabs (native `storage` event semantics).
 */
export function subscribeDraftChanges(
  userId: string,
  cb: (draft: ReportDraft | null) => void,
): () => void {
  if (!isBrowser())
    return () => {
      /* noop */
    };
  const key = keyFor(userId);
  const handler = (e: StorageEvent) => {
    if (e.key !== key) return;
    if (!e.newValue) {
      cb(null);
      return;
    }
    try {
      const parsed = JSON.parse(e.newValue) as ReportDraft;
      cb(parsed);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/** True if the draft has any meaningful user input beyond defaults. */
export function isDraftMeaningful(d: ReportDraftSnapshot): boolean {
  if (d.goalkeeper.trim() || d.team.trim() || d.opponent.trim() || d.comments.trim()) return true;
  if (d.selectedMedia.length > 0) return true;
  return Object.values(d.scores).some((n) => n !== 3);
}
