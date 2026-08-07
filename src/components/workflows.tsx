import { toast } from "sonner";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { X, CheckCircle2, Upload, AlertCircle, Paperclip, Search, Trash2, Loader2, RotateCcw } from "lucide-react";
import { goalkeepers } from "@/lib/mock-data";
import { listPlayers, type PlayerRosterRow } from "@/lib/players.functions";
import {
  attachInteractionAudio,
  createInteraction,
  updateInteraction,
} from "@/lib/interactions.functions";
import { interactionsQueryKey } from "@/lib/interactions/use-interactions";
import {
  interactionAudioFileName,
  interactionAudioNotes,
  interactionAudioTitle,
  persistInteractionAudio,
  type InteractionRecording,
} from "@/lib/interactions/audio";
import type { LoggedInteraction } from "@/lib/interactions/schema";
import {
  INTERACTION_OUTCOMES, todayDateOnly, formatDateOnly,
  MATCH_REPORT_INTERACTION_TYPE, MANUAL_INTERACTION_TYPES,
  type InteractionTypeValue,
} from "@/lib/interactions/schema";
import { reconcileInteraction } from "@/lib/interactions/map";
import {
  clearInteractionDraft,
  loadInteractionDraft,
  saveInteractionDraft,
} from "@/lib/interactions/draft-store";

import { refreshInteractionViews } from "@/lib/query-refresh";
import { useAuth, type SessionUser } from "@/lib/auth";
import {
  ACCEPT_BY_KIND, MAX_FILE_BYTES, detectKind, formatBytes, uploadMedia,
  updateMedia, listMedia, attachMediaToReport, getMediaByIds, getSignedUrl,
  RATING_TAG_OPTIONS,
  type MediaAsset, type MediaKind,
} from "@/lib/media-store";
import { HandwrittenNotesField } from "@/components/handwritten-notes-field";
import { VoiceNoteField } from "@/components/voice-note-field";
import { submitMatchReport } from "@/lib/match-reports/reports.functions";
import {
  PILLAR_IDS, PILLAR_LABELS, averageOfScores, type PillarId,
} from "@/lib/match-reports/schema";
import {
  loadDraft, saveDraft, overwriteDraft, clearDraft, isDraftMeaningful,
  subscribeDraftChanges, newTabId,
  type ReportDraft, type ReportDraftSnapshot,
} from "@/lib/match-reports/draft-store";
import {
  appendCommentText, mergeOcrText, validateComments,
} from "@/lib/match-reports/comments";
import { newSubmissionKey } from "@/lib/match-reports/duplicates";

function formatDraftTime(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return sameDay ? t : `${d.toLocaleDateString()} ${t}`;
  } catch { return iso; }
}

type MediaChipInfo = {
  title: string;
  kind: MediaKind;
  thumbnailPath: string | null;
  filePath: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
};

function DraftStatusIndicator({
  status,
  savedAt,
  onRetry,
}: {
  status: "idle" | "saving" | "saved" | "failed";
  savedAt: string | null;
  onRetry: () => void;
}) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600">
        <CheckCircle2 className="size-3" /> Saved
        {savedAt && <span className="text-muted-foreground">· {formatDraftTime(savedAt)}</span>}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertCircle className="size-3" /> Failed to save
        <button type="button" onClick={onRetry} className="underline hover:text-destructive/80 ml-1">Retry</button>
      </span>
    );
  }
  return <span className="opacity-60 text-muted-foreground">Autosaves every 5s</span>;
}

export type WorkflowKind = "interaction" | "report" | "media" | "goalkeeper";

const TITLES: Record<WorkflowKind, string> = {
  interaction: "Log Interaction",
  report: "Submit Report",
  media: "Upload Media",
  goalkeeper: "Add Goalkeeper",
};

/** Context handed from Log Interaction to the Match Report workflow. */
export interface MatchReportHandoff {
  goalkeeper: string;
  matchDate: string;
  club: string;
}

export function WorkflowDialog({ kind, onClose, prefillGoalkeeper, prefillMatchDate, prefillOpponent, prefillGkId, editingInteraction }: { kind: WorkflowKind | null; onClose: () => void; prefillGoalkeeper?: string; prefillMatchDate?: string; prefillOpponent?: string; prefillGkId?: string; editingInteraction?: LoggedInteraction | null }) {
  /**
   * Change #1: choosing Live Match Observation in Log Interaction hands over to
   * the Match Report workflow in place, carrying the goalkeeper, date and club
   * across. Held here rather than in the parent so every entry point to the
   * dialog gets the behaviour without changes of its own.
   */
  const [handoff, setHandoff] = useState<MatchReportHandoff | null>(null);
  useEffect(() => {
    if (!kind) setHandoff(null);
  }, [kind]);

  if (!kind) return null;
  const activeKind: WorkflowKind = handoff ? "report" : kind;
  const isEditing = activeKind === "interaction" && !!editingInteraction;
  const title = isEditing ? "Edit Interaction" : TITLES[activeKind];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeKind === "report"
                ? handoff
                  ? "Live Match Observation · the interaction is created when this report is submitted"
                  : "Draft autosaves locally · Submission writes to the RPM Match Reports Google Sheet"
                : activeKind === "media"
                  ? "Stored in Lovable Cloud"
                  : activeKind === "interaction"
                    ? isEditing
                      ? "Corrects the original record · visible everywhere it appears"
                      : "Saved to Lovable Cloud · visible in the interactions log"
                    : "Saved locally to this session"}
            </p>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {activeKind === "interaction" && (
            <InteractionForm
              onDone={onClose}
              editing={editingInteraction ?? null}
              onOpenMatchReport={setHandoff}
              prefillGkId={prefillGkId}
              prefillDate={prefillMatchDate}
            />
          )}
          {activeKind === "report" && (
            <ReportForm
              onDone={onClose}
              prefillGoalkeeper={handoff?.goalkeeper ?? prefillGoalkeeper}
              prefillMatchDate={handoff?.matchDate ?? prefillMatchDate}
              prefillOpponent={prefillOpponent}
              prefillTeam={handoff?.club}
            />
          )}
          {activeKind === "media" && <MediaForm onDone={onClose} prefillGkId={prefillGkId} />}
          {activeKind === "goalkeeper" && <GoalkeeperForm onDone={onClose} />}
        </div>
      </div>
    </div>
  );
}

export function EditMediaDialog({ asset, onClose }: { asset: MediaAsset | null; onClose: () => void }) {
  if (!asset) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-card border border-border rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h3 className="text-base font-semibold">Edit Media</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Update metadata, tags or the linked goalkeeper.</p>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          <EditMediaForm asset={asset} onDone={onClose} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5" aria-hidden="true">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {error && (
        <p className="mt-1 text-[11px] text-destructive flex items-center gap-1" role="alert">
          <AlertCircle className="size-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
const inputCls = "w-full h-9 px-3 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";
const selectCls = inputCls;
const taCls = "w-full px-3 py-2 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none";

function Submitted({
  message,
  onDone,
  action,
  pending = false,
  detail,
}: {
  message: string;
  onDone: () => void;
  action?: { label: string; onClick: () => void };
  pending?: boolean;
  /** Secondary status shown under the message, e.g. how the audio upload went. */
  detail?: ReactNode;
}) {
  return (
    <div className="text-center py-6">
      {pending ? (
        <AlertCircle className="size-10 text-amber-500 mx-auto" />
      ) : (
        <CheckCircle2 className="size-10 text-primary mx-auto" />
      )}
      <p className="text-sm font-medium mt-3">{message}</p>
      {detail && <div className="mt-3">{detail}</div>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {action && (
          <button onClick={action.onClick} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
            {action.label}
          </button>
        )}
        <button
          onClick={onDone}
          className={`h-9 px-4 rounded-md text-sm font-medium ${
            action ? "border border-border hover:bg-accent" : "bg-primary text-primary-foreground"
          }`}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function TagPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {RATING_TAG_OPTIONS.map((t) => {
        const active = value.includes(t);
        return (
          <button key={t} type="button" onClick={() => onChange(active ? value.filter((x) => x !== t) : [...value, t])}
            className={`px-2 py-0.5 rounded text-[10px] border ${active ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-accent/40"}`}>
            {t}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Interaction form — logging and correcting interactions in `public.interactions`.
 *
 * Success is only ever shown after the server returns a confirmed row that has
 * passed a read-back; on failure every entered value is retained.
 *
 * Two behaviours worth knowing about:
 *   - Selecting Live Match Observation does not create an interaction here. It
 *     hands over to the Match Report workflow, which creates the report and its
 *     interaction together in one server-controlled call (change #1).
 *   - Passing `editing` switches the form into correction mode. It updates the
 *     ORIGINAL row and never creates a replacement (change #3).
 *
 * A voice recording is saved as a SECOND, separate step, after the interaction
 * row is confirmed. Doing it in that order means a failed interaction can never
 * leave an orphaned media record, and a failed upload can never be reported as
 * a failed interaction.
 */

/** Shown only when the interaction was written but its recording was not. */
const AUDIO_PARTIAL_FAILURE_MESSAGE = "Interaction saved — audio was not saved";

type AudioSaveStatus = "idle" | "saving" | "saved" | "failed";

/**
 * Best-effort duration for a picked audio file. Metadata can be missing or
 * infinite for some containers, in which case 0 is used — the upload must
 * never be blocked by a duration we could not read.
 */
async function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement("audio");
      const finish = (value: number) => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
      };
      el.preload = "metadata";
      el.onloadedmetadata = () => finish(el.duration);
      el.onerror = () => finish(0);
      el.src = url;
      window.setTimeout(() => finish(el.duration), 4000);
    } catch {
      resolve(0);
    }
  });
}



/**
 * Byte-level upload progress. Falls back to an indeterminate bar when the
 * browser cannot report progress, so the mentor always sees live movement.
 */
function AudioUploadProgress({ progress }: { progress: number | null }) {
  const determinate = typeof progress === "number";
  const pct = determinate ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;
  return (
    <div className="w-full max-w-sm">
      <p
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" />
          {pct === 100 ? "Finishing upload…" : "Uploading audio recording…"}
        </span>
        {pct !== null && <span className="tabular-nums font-medium">{pct}%</span>}
      </p>
      <div
        role="progressbar"
        aria-label="Audio upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(pct !== null ? { "aria-valuenow": pct } : {})}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] duration-200 ease-out ${
            determinate ? "" : "w-1/3 animate-pulse"
          }`}
          {...(determinate ? { style: { width: `${pct}%` } } : {})}
        />
      </div>
    </div>
  );
}

/**
 * Reports the recording's fate separately from the interaction's. "Audio saved"
 * appears only for `saved`, which is set solely when the upload AND the
 * database link both succeeded.
 */
function AudioSaveStatusNote({
  status,
  error,
  summary,
  progress,
}: {
  status: AudioSaveStatus;
  error: string | null;
  summary: string | null;
  progress?: number | null;
}) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <div className="mx-auto max-w-sm">
        <AudioUploadProgress progress={progress ?? null} />
      </div>
    );
  }
  if (status === "saved") {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-primary">
        <CheckCircle2 className="size-3.5" /> Audio saved
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="mx-auto max-w-sm rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs"
    >
      {summary && <p className="text-muted-foreground">{summary}</p>}
      <p className={summary ? "mt-1" : undefined}>
        The recording is still here and has not been lost.{error ? ` ${error}` : ""}
      </p>
    </div>
  );
}

export function InteractionForm({
  onDone,
  editing = null,
  onOpenMatchReport,
  prefillGkId,
  prefillDate,
}: {
  onDone: () => void;
  editing?: LoggedInteraction | null;
  onOpenMatchReport?: (ctx: MatchReportHandoff) => void;
  /** Goalkeeper to pre-select when opened from a profile or a calendar entry. */
  prefillGkId?: string;
  /** Date to pre-select when opened from a calendar day (YYYY-MM-DD). */
  prefillDate?: string;
}) {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createInteraction);
  const updateFn = useServerFn(updateInteraction);
  const attachAudioFn = useServerFn(attachInteractionAudio);
  const { user } = useAuth();
  const isEditing = !!editing;

  const [done, setDone] = useState(false);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);

  const [notes, setNotes] = useState(editing?.notes ?? "");
  /**
   * Older interactions were stored with only a goalkeeper name — no player id
   * and no slug — so fall back to matching the name. Without this the selector
   * would open empty and the mentor would have to re-identify the goalkeeper
   * just to correct a date.
   */
  const [gkId, setGkId] = useState(() => {
    if (!editing) return prefillGkId ?? "";
    if (editing.playerId) return editing.playerId;
    if (editing.gkSlug) return editing.gkSlug;
    const target = editing.goalkeeperName.trim().toLowerCase();
    return goalkeepers.find((g) => g.name.trim().toLowerCase() === target)?.id ?? "";
  });
  // Defaults to a type that can actually be logged here. Live Match Observation
  // is still selectable, but it hands over to the Match Report rather than
  // creating an observation with no report behind it.
  const [type, setType] = useState<InteractionTypeValue>(
    (editing?.interactionType as InteractionTypeValue) ?? MANUAL_INTERACTION_TYPES[0]!,
  );
  const [club, setClub] = useState(editing?.club ?? "");
  const [date, setDate] = useState(() => editing?.occurredAt ?? prefillDate ?? todayDateOnly());
  const [outcome, setOutcome] = useState<string>(editing?.outcome ?? "");
  const [followUp, setFollowUp] = useState(editing?.followUp ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubAutoFilled, setClubAutoFilled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const autoFilledClubRef = useRef<string | null>(null);
  const gk = goalkeepers.find((g) => g.id === gkId);

  /**
   * The recording is held here, not uploaded on the spot, because the
   * interaction it must be linked to does not exist until Save. It is kept
   * after a failed upload so Retry has something to send.
   */
  const [recording, setRecording] = useState<InteractionRecording | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioSaveStatus>("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  /** 0–1 while the recording's bytes are going up; null when not uploading. */
  const [audioProgress, setAudioProgress] = useState<number | null>(null);

  const [savedInteraction, setSavedInteraction] = useState<LoggedInteraction | null>(null);

  /**
   * Draft persistence. Navigating away mid-entry (accidental back, a link, a
   * refresh) must not lose typed context, so the in-progress values are mirrored
   * to browser-local storage and restored the next time the form is opened.
   * Only for new interactions — a correction always starts from the stored row.
   */
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const draftReadyRef = useRef(false);
  useEffect(() => {
    if (isEditing) return;
    const draft = loadInteractionDraft();
    if (draft) {
      // Explicit context (a goalkeeper profile, a calendar day) wins over the draft.
      if (!prefillGkId && draft.gkId) setGkId(draft.gkId);
      if (!prefillDate && draft.date) setDate(draft.date);
      if (draft.type && (MANUAL_INTERACTION_TYPES as readonly string[]).includes(draft.type)) {
        setType(draft.type as InteractionTypeValue);
      }
      if (draft.club) setClub(draft.club);
      if (draft.notes) {
        notesRef.current = draft.notes;
        setNotes(draft.notes);
      }
      if (draft.outcome) setOutcome(draft.outcome);
      if (draft.followUp) setFollowUp(draft.followUp);
      setDraftRestoredAt(draft.savedAt);
    }
    draftReadyRef.current = true;
    // Mount only: restoring later would fight the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEditing || !draftReadyRef.current) return;
    const handle = window.setTimeout(() => {
      saveInteractionDraft({ gkId, type, club, date, notes, outcome, followUp });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [isEditing, gkId, type, club, date, notes, outcome, followUp]);

  function discardDraft() {
    clearInteractionDraft();
    setDraftRestoredAt(null);
    setGkId(prefillGkId ?? "");
    setType(MANUAL_INTERACTION_TYPES[0]!);
    setClub("");
    setDate(prefillDate ?? todayDateOnly());
    notesRef.current = "";
    setNotes("");
    setOutcome("");
    setFollowUp("");
    setErrors({});
    setShowErrors(false);
  }

  /**
   * Media asset created by an earlier attempt. Reusing it is what makes Retry
   * idempotent: the recording is uploaded at most once however many times the
   * link is retried.
   */
  const uploadedMediaIdRef = useRef<string | null>(null);

  /**
   * Change #4. The transcript lives inside VoiceNoteField until it is applied,
   * and `notes` is read from a render closure at submit time. Mirroring notes
   * into a ref means a transcript applied moments before Save is still seen by
   * the submit handler, instead of being dropped because React had not
   * re-rendered yet.
   */
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const applyTranscribedText = (text: string, mode: "append" | "replace") => {
    const next =
      mode === "replace" || !notesRef.current.trim()
        ? text
        : `${notesRef.current.trim()}\n\n${text}`;
    notesRef.current = next;
    setNotes(next);
    clearFieldError("notes");
  };

  /**
   * A Live Match Observation is produced by submitting a Match Report, so
   * choosing it while logging hands over instead of saving. Correcting one that
   * already exists is still a normal edit.
   */
  const handOffToMatchReport = !isEditing && type === MATCH_REPORT_INTERACTION_TYPE;
  /** Editing a row created by a Match Report — its type is immutable. */
  const isMatchReportObservation =
    isEditing && editing?.interactionType === MATCH_REPORT_INTERACTION_TYPE;

  const validationErrors = useMemo(
    () => validate({ gkId, date, notes, outcome, followUp }),
    [gkId, date, notes, outcome, followUp],
  );
  const canSubmit = Object.keys(validationErrors).length === 0 && !saving;



  const listPlayersFn = useServerFn(listPlayers);
  const playersQuery = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  const players: PlayerRosterRow[] = playersQuery.data ?? [];
  const playersByName = useMemo(() => {
    const map = new Map<string, PlayerRosterRow>();
    for (const p of players) map.set(p.full_name.trim().toLowerCase(), p);
    return map;
  }, [players]);

  /**
   * The selected option. A canonical `players.id` is carried ONLY when the
   * user picked a real player record; legacy roster profiles link to nothing.
   */
  const selectedPlayer = useMemo(() => players.find((p) => p.id === gkId) ?? null, [players, gkId]);
  const selection = useMemo(() => {
    if (selectedPlayer) return { name: selectedPlayer.full_name, slug: "", playerId: selectedPlayer.id };
    if (gk) return { name: gk.name, slug: gk.id, playerId: null as string | null };
    return null;
  }, [selectedPlayer, gk]);

  useEffect(() => {
    if (selectedPlayer) {
      const canOverwritePlayerClub = !club.trim() || club === autoFilledClubRef.current;
      if (!canOverwritePlayerClub || club === selectedPlayer.current_club) return;
      setClub(selectedPlayer.current_club);
      autoFilledClubRef.current = selectedPlayer.current_club;
      setClubAutoFilled(true);
      return;
    }
    if (!gk) return;
    const match = playersByName.get(gk.name.trim().toLowerCase());
    if (!match) return;
    const canOverwrite = !club.trim() || club === autoFilledClubRef.current;
    if (!canOverwrite) return;
    if (club === match.current_club) return;
    setClub(match.current_club);
    autoFilledClubRef.current = match.current_club;
    setClubAutoFilled(true);
  }, [gk, selectedPlayer, playersByName, club]);

  function handleClubChange(v: string) {
    setClub(v);
    if (v !== autoFilledClubRef.current) setClubAutoFilled(false);
  }

  function resetClub() {
    const rosterClub = autoFilledClubRef.current;
    if (rosterClub) {
      setClub(rosterClub);
      setClubAutoFilled(true);
    }
  }

  function validate(values: { gkId: string; date: string; notes: string; outcome: string; followUp: string }): Record<string, string> {
    const next: Record<string, string> = {};
    if (!values.gkId.trim()) next.gkId = "Select a goalkeeper";
    if (!values.date.trim()) next.date = "Date is required";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) next.date = "Enter a valid date";
    if (!values.notes.trim()) next.notes = "Notes are required";
    else if (values.notes.trim().length > 8000) next.notes = "Notes must be under 8,000 characters";
    if (!values.outcome.trim()) next.outcome = "Select an outcome";
    if (!values.followUp.trim()) next.followUp = "Follow-up action is required";
    else if (values.followUp.trim().length > 200) next.followUp = "Follow-up action must be under 200 characters";
    return next;
  }


  function clearFieldError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Hand the entered context over to the Match Report workflow (change #1). */
  function handleContinueToMatchReport() {
    if (!selection) {
      setErrors({ gkId: "Select a goalkeeper" });
      setShowErrors(true);
      return;
    }
    onOpenMatchReport?.({ goalkeeper: selection.name, matchDate: date, club: club.trim() });
  }

  /**
   * Upload the recording through the shared media/storage path and link it to
   * the confirmed interaction. Returns whether BOTH steps succeeded — the only
   * condition under which the audio may be reported as saved.
   */
  async function saveRecording(
    interaction: LoggedInteraction,
    audio: InteractionRecording,
  ): Promise<boolean> {
    setAudioStatus("saving");
    setAudioError(null);
    // Start at 0 so the bar appears immediately, before the first byte event.
    setAudioProgress(uploadedMediaIdRef.current ? 1 : 0);

    // Media library grouping only. A canonical players.id when there is one,
    // otherwise the roster slug — never the goalkeeper's name.
    const gkMediaId = interaction.playerId || interaction.gkSlug || selection?.slug || "";

    const result = await persistInteractionAudio({
      uploadedMediaId: uploadedMediaIdRef.current,
      upload: async () => {
        if (!user) throw new Error("Sign in required to save the recording.");
        const name = interactionAudioFileName(audio.mimeType);
        const asset = await uploadMedia({
          file: new File([audio.blob], name, { type: audio.mimeType }),
          gkId: gkMediaId,
          title: interactionAudioTitle(interaction.goalkeeperName, interaction.occurredAt),
          notes: interactionAudioNotes(audio.durationSec),
          kind: "audio",
          user,
          onProgress: (fraction) => setAudioProgress(fraction),
        });
        return asset.id;
      },
      link: async (mediaId) => {
        setAudioProgress(1);
        const link = await attachAudioFn({
          data: { interactionId: interaction.id, mediaId },
        });
        if (!link?.mediaId) {
          throw new Error("The recording could not be confirmed as linked to this interaction.");
        }
      },
    });

    uploadedMediaIdRef.current = result.mediaId;
    if (!result.ok) {
      setAudioStatus("failed");
      setAudioError(result.message);
      setAudioProgress(null);
      return false;
    }
    setAudioStatus("saved");
    setAudioProgress(null);
    await refreshInteractionViews(queryClient);
    return true;

  }

  /**
   * Retry only the audio. The interaction is already written, so this never
   * calls the interaction server functions again and can never duplicate it.
   */
  async function retryAudio() {
    if (!savedInteraction || !recording || audioStatus === "saving") return;
    const ok = await saveRecording(savedInteraction, recording);
    if (ok) {
      toast.success("Audio saved", {
        description: "The recording is attached to this interaction.",
      });
      clearInteractionDraft();
      onDone();
    }
  }

  /**
   * Abandon only the recording. The interaction itself is already written, so
   * this closes the form without touching it — used when the upload keeps
   * failing and the mentor would rather move on.
   */
  function discardFailedRecording() {
    setRecording(null);
    setAudioStatus("idle");
    setAudioError(null);
    clearInteractionDraft();
    toast.info("Recording discarded", {
      description: "The interaction and its notes are saved.",
    });
    onDone();
  }

  /**
   * Swap the pending recording for a new one (freshly recorded or picked from
   * a file) and send it straight away. The interaction row is untouched, so
   * every note and field stays exactly as entered; only the audio is replaced.
   */
  async function replaceRecording(next: InteractionRecording) {
    // A previous partial upload must not be reused — this is different audio.
    uploadedMediaIdRef.current = null;
    setRecording(next);
    setAudioError(null);
    if (!savedInteraction) {
      setAudioStatus("idle");
      return;
    }
    const ok = await saveRecording(savedInteraction, next);
    if (ok) {
      toast.success("Audio saved", {
        description: "The new recording is attached to this interaction.",
      });
      clearInteractionDraft();
      onDone();
    }
  }

  /** Route recordings from the voice field through the replace path once the
   * interaction is already written, so "record again" resends immediately. */
  function handleRecordingReady(next: InteractionRecording | null) {
    if (!next) {
      setRecording(null);
      return;
    }
    if (savedInteraction && audioStatus !== "saving") {
      void replaceRecording(next);
      return;
    }
    setRecording(next);
  }

  /** Read a chosen audio file into a recording, measuring its duration. */
  async function handleAudioFilePicked(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setAudioError("Choose an audio file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setAudioError(`That file is too large (max ${formatBytes(MAX_FILE_BYTES)}).`);
      return;
    }
    const durationSec = await readAudioDuration(file);
    await replaceRecording({ blob: file, mimeType: file.type, durationSec });
  }

  /** Prompt for a new recording using the voice field further down the form. */
  function focusVoiceRecorder() {
    setRecording(null);
    setAudioError(null);
    const node = document.getElementById("interaction-voice-note");
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }




  /**
   * Save the recording and report the outcome separately from the interaction.
   * A failed recording is never allowed to read as a failed interaction.
   * Returns whether the recording was stored, so the caller can decide between
   * closing straight back to the page the user came from and holding the
   * dialog open on the retry screen.
   */
  async function saveRecordingAndReport(interaction: LoggedInteraction): Promise<boolean> {
    if (!recording) return true;
    let ok = false;
    try {
      ok = await saveRecording(interaction, recording);
    } catch (err) {
      // Nothing that happens to the recording may escape into the interaction's
      // own error path — the interaction is already confirmed written.
      setAudioStatus("failed");
      setAudioError(err instanceof Error ? err.message : null);
    }
    if (!ok) {
      toast.error(AUDIO_PARTIAL_FAILURE_MESSAGE, {
        description: "Your recording is kept — use Retry saving audio to try again.",
      });
    }
    return ok;
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The interaction is already written and only its recording is outstanding;
    // submitting again here would duplicate the row.
    if (savedInteraction) {
      void retryAudio();
      return;
    }

    // Read the latest notes, not the value captured when this render began, so
    // a transcript applied immediately before Save is never lost.
    const currentNotes = notesRef.current;
    const validation = validate({ gkId, date, notes: currentNotes, outcome, followUp });

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setShowErrors(true);
      setError(null);
      return;
    }
    if (saving || !selection) return;
    setSaving(true);
    setError(null);
    setShowErrors(false);

    if (isEditing && editing) {
      try {
        const saved = await updateFn({
          data: {
            id: editing.id,
            playerId: selection.playerId,
            gkSlug: selection.slug,
            goalkeeperName: selection.name,
            interactionType: type,
            club: club.trim(),
            occurredAt: date,
            notes: currentNotes.trim(),
            outcome,
            followUp: followUp.trim(),
          },
        });
        // The server read the row back; re-assert the values here so a partial
        // response can never be presented as a successful correction.
        if (!saved?.id || saved.occurredAt !== date) {
          throw new Error("The change could not be confirmed as saved.");
        }
        // Refresh the log, timeline, dashboard and Duty of Care together.
        await refreshInteractionViews(queryClient);
        const shownDate = formatDateOnly(saved.occurredAt);
        toast.success("Interaction updated", {
          description: `${saved.interactionType} with ${saved.goalkeeperName} on ${shownDate}.`,
        });
        setSavedSummary(
          `Interaction updated — ${saved.interactionType} with ${saved.goalkeeperName} on ${shownDate}. The log, timeline and Duty of Care now show the corrected values.`,
        );
        setSavedInteraction(saved);
        // Reported separately: the correction is already stored either way.
        const audioOk = await saveRecordingAndReport(saved);
        // Confirmed saved: close straight back to the page the user came from.
        // Only a failed recording holds the dialog open, for the retry option.
        // A failed recording keeps the form exactly as it is — every field and
        // note stays on screen — so the upload can be retried in place.
        if (audioOk) onDone();


      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save the change. Please try again.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    // Optimistic timeline update: show the interaction immediately, roll back on failure.
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticRow = {
      id: optimisticId,
      gkSlug: selection.slug,
      goalkeeperName: selection.name,
      playerId: selection.playerId,
      mentorId: "",
      mentorName: "",
      interactionType: type,
      club: club.trim(),
      occurredAt: date,
      notes: currentNotes.trim(),
      outcome,
      followUp: followUp.trim(),
      createdAt: new Date().toISOString(),
      matchReportId: null,
      updatedAt: null,
      updatedBy: null,
      optimistic: true,
    } as unknown as LoggedInteraction;

    await queryClient.cancelQueries({ queryKey: interactionsQueryKey });
    const previous = queryClient.getQueryData<LoggedInteraction[]>(interactionsQueryKey);
    if (previous) {
      queryClient.setQueryData<LoggedInteraction[]>(interactionsQueryKey, [optimisticRow, ...previous]);
    }

    try {
      const saved = await createFn({
        data: {
          playerId: selection.playerId,
          gkSlug: selection.slug,
          goalkeeperName: selection.name,
          interactionType: type,
          club: club.trim(),
          occurredAt: date,
          notes: currentNotes.trim(),
          outcome,
          followUp: followUp.trim(),
        },
      });
      // Only a confirmed inserted row counts as success.
      if (!saved?.id) throw new Error("The interaction could not be confirmed as saved.");
      // Reconcile: the server row is authoritative for id, timestamps, mentor
      // identity, player link and the outcome/follow-up fields.
      let confirmed = saved;
      queryClient.setQueryData<LoggedInteraction[]>(interactionsQueryKey, (curr) => {
        const next = reconcileInteraction(curr, optimisticId, saved);
        confirmed = next.find((i) => i.id === saved.id) ?? saved;
        return next;
      });
      await refreshInteractionViews(queryClient);
      const shownName = confirmed.goalkeeperName || selection.name;
      const shownType = confirmed.interactionType || type;
      const shownDate = formatDateOnly(confirmed.occurredAt || date);
      toast.success("Interaction saved", {
        description: `${shownType} with ${shownName} on ${shownDate} — now on the timeline.`,
      });
      setSavedSummary(`Interaction logged successfully — ${shownType} with ${shownName} on ${shownDate}. It's now in the interactions log.`);
      setSavedInteraction(confirmed);
      // The work is stored server-side now, so the local draft is finished with.
      clearInteractionDraft();

      // Only now, with a confirmed interaction id to link to, is the recording
      // uploaded — so a failed interaction can never orphan a media record.
      const audioOk = await saveRecordingAndReport(confirmed);
      // Confirmed saved: close straight back to the page the user came from.
      // A failed recording holds the form open, with all fields intact, so the
      // upload can be retried without re-entering anything.
      if (audioOk) onDone();



    } catch (err) {
      // Roll the optimistic timeline entry back.
      if (previous) queryClient.setQueryData<LoggedInteraction[]>(interactionsQueryKey, previous);
      else queryClient.setQueryData<LoggedInteraction[]>(interactionsQueryKey, (curr) =>
        curr ? curr.filter((i) => i.id !== optimisticId) : curr,
      );
      // Retain every entered value — no success state without a read-back.
      setError(err instanceof Error ? err.message : "Could not save the interaction. Please try again.");
    } finally {
      setSaving(false);
    }
  }


  if (done) {
    const audioFailed = audioStatus === "failed";
    return (
      <Submitted
        message={
          audioFailed
            ? AUDIO_PARTIAL_FAILURE_MESSAGE
            : (savedSummary ?? "Interaction logged successfully.")
        }
        pending={audioFailed}
        onDone={onDone}
        action={
          audioFailed
            ? { label: "Retry saving audio", onClick: () => void retryAudio() }
            : undefined
        }
        detail={
          <AudioSaveStatusNote
            status={audioStatus}
            error={audioError}
            summary={audioFailed ? savedSummary : null}
            progress={audioProgress}
          />
        }
      />
    );
  }
  const audioUploading = audioStatus === "saving";
  return (
    <form aria-label="Log interaction form" onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="font-medium">Not saved.</span> {error} Your entries have been kept — fix the issue and try again.
        </div>
      )}

      {savedInteraction && audioStatus === "failed" && (
        <div
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs"
        >
          <p className="font-medium">{AUDIO_PARTIAL_FAILURE_MESSAGE}</p>
          <p className="mt-1 text-muted-foreground">
            Your notes and every field are saved and still here. The recording was kept too —
            resend it without re-entering anything.{audioError ? ` ${audioError}` : ""}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void retryAudio()}
              disabled={audioUploading}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RotateCcw className="size-3.5" /> Retry saving audio
            </button>
            <button
              type="button"
              onClick={discardFailedRecording}
              disabled={audioUploading}
              className="h-8 px-3 rounded-md border border-border text-xs disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Finish without the recording
            </button>
          </div>
        </div>
      )}
      {savedInteraction && audioUploading && <AudioUploadProgress progress={audioProgress} />}

      {savedInteraction && audioStatus === "saved" && (
        <p className="inline-flex items-center gap-1.5 text-xs text-primary">
          <CheckCircle2 className="size-3.5" /> Audio saved
        </p>
      )}

      {draftRestoredAt && (

        <div className="flex items-start justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <p>
            <span className="font-medium">Unsaved draft restored.</span>{" "}
            <span className="text-muted-foreground">
              Picked up from {formatDateOnly(draftRestoredAt.slice(0, 10))} — nothing has been saved yet.
            </span>
          </p>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 text-primary hover:text-primary/80"
          >
            Start blank
          </button>
        </div>
      )}



      <fieldset disabled={saving} className="space-y-4 border-0 p-0 m-0 min-w-0">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Goalkeeper" required error={showErrors ? errors.gkId : undefined}>
            <select
              aria-label="Goalkeeper"
              aria-invalid={showErrors && !!errors.gkId}
              aria-required="true"
              className={`${selectCls} ${showErrors && errors.gkId ? "border-destructive focus:ring-destructive/40" : ""}`}
              value={gkId}
              onChange={(e) => { setGkId(e.target.value); clearFieldError("gkId"); }}
              onBlur={() => { if (!gkId) setErrors((prev) => ({ ...prev, gkId: "Select a goalkeeper" })); }}
            >
              <option value="" disabled>Select…</option>
              {players.length > 0 && (
                <optgroup label="Player records">
                  {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </optgroup>
              )}
              <optgroup label="Legacy profiles (no player record)">
                {goalkeepers.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Interaction Type" required>
            {isMatchReportObservation ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {MATCH_REPORT_INTERACTION_TYPE}
                <p className="mt-1 text-xs text-muted-foreground">
                  Created by a Match Report, so the type stays fixed. You can still correct the
                  other details.
                </p>
              </div>
            ) : (
              <select aria-label="Interaction Type" className={selectCls} required value={type} onChange={(e) => setType(e.target.value as InteractionTypeValue)}>
                {MANUAL_INTERACTION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            )}
          </Field>
          {handOffToMatchReport && (
            <div className="col-span-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs">
              <p className="font-medium">A Live Match Observation is logged from the Match Report.</p>
              <p className="mt-1 text-muted-foreground">
                Continue to the Match Report and the interaction is created automatically when you
                submit it — with the same goalkeeper, date and club — so the two can never disagree
                and no duplicate is created if you retry.
              </p>
            </div>
          )}
          <Field label="Club">
            <input aria-label="Club" className={inputCls} value={club} onChange={(e) => handleClubChange(e.target.value)} placeholder="e.g. Brighton & Hove Albion" maxLength={80} />
            {clubAutoFilled ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Auto-filled from roster · edit to override</p>
            ) : autoFilledClubRef.current ? (
              <button type="button" onClick={resetClub} className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">
                <RotateCcw className="size-3" /> Reset to roster club
              </button>
            ) : null}
          </Field>

          <Field label="Date" required error={showErrors ? errors.date : undefined}>
            <input
              aria-label="Date"
              aria-invalid={showErrors && !!errors.date}
              aria-required="true"
              type="date"
              className={`${inputCls} ${showErrors && errors.date ? "border-destructive focus:ring-destructive/40" : ""}`}
              value={date}
              onChange={(e) => { setDate(e.target.value); clearFieldError("date"); }}
              onBlur={() => { if (!date) setErrors((prev) => ({ ...prev, date: "Date is required" })); }}
            />
          </Field>
          <Field label="Outcome" required error={showErrors ? errors.outcome : undefined}>
            <select
              aria-label="Outcome"
              aria-invalid={showErrors && !!errors.outcome}
              aria-required="true"
              className={`${selectCls} ${showErrors && errors.outcome ? "border-destructive focus:ring-destructive/40" : ""}`}
              value={outcome}
              onChange={(e) => { setOutcome(e.target.value); clearFieldError("outcome"); }}
              onBlur={() => { if (!outcome) setErrors((prev) => ({ ...prev, outcome: "Select an outcome" })); }}
            >
              <option value="" disabled>Select…</option>
              {INTERACTION_OUTCOMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>

        </div>
        <HandwrittenNotesField
          context={gk ? `Session notes about ${gk.name} (${club || gk.club})` : undefined}
          onTranscribed={applyTranscribedText}
        />
        {/*
          `autoApply` is what fixes change #4. Without it a transcript stays
          inside VoiceNoteField until the reviewed checkbox and two more clicks
          are completed, so a mentor who records a note, sees it on screen and
          presses Save leaves Notes empty and nothing is ever written. The
          transcript now lands in Notes as soon as it arrives, where it is
          visible, editable and — most importantly — actually submitted.
        */}
        {/*
          `onRecordingReady` keeps the raw recording in this form's state. It is
          uploaded and linked after the interaction is confirmed saved, so the
          spoken note survives a refresh instead of dying with the page — and a
          failed upload leaves the recording here, ready to retry.
        */}
        <VoiceNoteField
          autoApply
          onTranscribed={applyTranscribedText}
          onRecordingReady={setRecording}
        />
        <Field label="Notes" required error={showErrors ? errors.notes : undefined}>
          <textarea
            aria-label="Notes"
            aria-invalid={showErrors && !!errors.notes}
            aria-required="true"
            rows={5}
            className={`${taCls} ${showErrors && errors.notes ? "border-destructive focus:ring-destructive/40" : ""}`}
            placeholder="What did you observe? Or use the camera/mic above to transcribe notes."
            value={notes}
            onChange={(e) => { setNotes(e.target.value); clearFieldError("notes"); }}
            onBlur={() => { if (!notes.trim()) setErrors((prev) => ({ ...prev, notes: "Notes are required" })); }}
          />
        </Field>
        <Field label="Follow-up Action" required error={showErrors ? errors.followUp : undefined}>
          <input
            aria-label="Follow-up Action"
            aria-invalid={showErrors && !!errors.followUp}
            aria-required="true"
            className={`${inputCls} ${showErrors && errors.followUp ? "border-destructive focus:ring-destructive/40" : ""}`}
            placeholder="e.g. Schedule video review next week"
            value={followUp}
            onChange={(e) => { setFollowUp(e.target.value); clearFieldError("followUp"); }}
            onBlur={() => { if (!followUp.trim()) setErrors((prev) => ({ ...prev, followUp: "Follow-up action is required" })); }}
            maxLength={200}
          />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        {/*
          Previously the submit button was simply disabled while the form was
          incomplete, which is how a voice-entered note failed silently: the
          mentor pressed a greyed-out button and nothing happened, with no
          explanation. It now stays clickable and reports exactly what is
          missing.
        */}
        {showErrors && !canSubmit && !saving && (
          <p role="status" className="mr-auto text-[11px] text-muted-foreground">
            Complete the highlighted fields to save.
          </p>
        )}
        <button type="button" onClick={onDone} className="h-9 px-3 rounded-md border border-border text-sm" disabled={saving}>
          {savedInteraction ? "Close" : "Cancel"}
        </button>
        {savedInteraction ? null : handOffToMatchReport ? (

          <button
            type="button"
            onClick={handleContinueToMatchReport}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
          >
            Continue to Match Report
          </button>
        ) : (
          <button type="submit" disabled={saving} aria-disabled={!canSubmit} className={`h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 ${canSubmit ? "" : "opacity-60"}`}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving
              ? audioStatus === "saving"
                ? "Saving audio…"
                : "Saving…"
              : isEditing
                ? "Save Changes"
                : "Save Interaction"}
          </button>
        )}

      </div>
    </form>
  );
}



/**
 * Match Report form — writes to the RPM Match Reports Google Sheet via
 * a server function. Fields locked to the confirmed 14-column schema.
 */
function ReportForm({ onDone, prefillGoalkeeper, prefillMatchDate, prefillOpponent, prefillTeam }: { onDone: () => void; prefillGoalkeeper?: string; prefillMatchDate?: string; prefillOpponent?: string; prefillTeam?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submitFn = useServerFn(submitMatchReport);
  const listPlayersFn = useServerFn(listPlayers);
  const playersQuery = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  const players: PlayerRosterRow[] = playersQuery.data ?? [];
  const playersByName = useMemo(() => {
    const map = new Map<string, PlayerRosterRow>();
    for (const p of players) map.set(p.full_name.trim().toLowerCase(), p);
    return map;
  }, [players]);
  // Track the value we auto-filled so a mentor's manual edit is never overwritten.
  const autoFilledTeamRef = useRef<string | null>(null);
  const [teamAutoFilled, setTeamAutoFilled] = useState(false);

  const [done, setDone] = useState<
    | {
        status: "submitted";
        reportId: string;
        average: number;
        /** Set when the report saved but its interaction did not. */
        interactionError?: string | null;
      }
    | { status: "queued" }
    | null
  >(null);
  const [goalkeeper, setGoalkeeper] = useState("");
  const coach = user?.name ?? "";
  const [competition, setCompetition] = useState("");
  const [team, setTeam] = useState("");
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<Record<PillarId, number>>({
    protect_goal: 3, protect_space: 3, protect_air: 3,
    control_play: 3, change_play: 3, psych: 3, physical: 3,
  });
  const [comments, setComments] = useState("");
  const commentsRef = useRef<HTMLTextAreaElement | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [voiceTranscript, setVoiceTranscript] = useState<import("@/lib/match-reports/draft-store").VoiceTranscriptDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Idempotency key for this attempt-set: stable across retries and the
  // "submit duplicate anyway" confirmation, so a lost response can never
  // produce a second sheet row. Reset only after a successful write.
  const submissionKeyRef = useRef<string>("");
  if (!submissionKeyRef.current) submissionKeyRef.current = newSubmissionKey();
  const [duplicate, setDuplicate] = useState<null | { window: "strong" | "soft"; message: string }>(null);
  const [, setFieldErrors] = useState<Record<string, string>>({});

  // ---------------- Draft persistence + versioning (localStorage) ----------------
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftRestoredFrom, setDraftRestoredFrom] = useState<string | null>(null);
  const tabIdRef = useRef<string>("");
  if (!tabIdRef.current) tabIdRef.current = newTabId();
  const localVersionRef = useRef<number>(0);
  const [conflict, setConflict] = useState<ReportDraft | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "accepted" | "rejected">>({});
  const preConflictLocalRef = useRef<ReportDraftSnapshot | null>(null);
  const [mediaTitles, setMediaTitles] = useState<Record<string, MediaChipInfo>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentSnapshot = (): ReportDraftSnapshot => ({
    goalkeeper, coach, competition, team, opponent, matchDate, scores, comments, selectedMedia,
    voiceTranscript,
  });

  const applySnapshot = (d: ReportDraftSnapshot) => {
    setGoalkeeper(d.goalkeeper);
    // coach is read-only, derived from the signed-in user — ignore d.coach
    setCompetition(d.competition ?? "");
    setTeam(d.team);
    setOpponent(d.opponent);
    if (d.matchDate) setMatchDate(d.matchDate);
    setScores(d.scores);
    setComments(d.comments);
    setSelectedMedia(d.selectedMedia);
    setVoiceTranscript(d.voiceTranscript ?? null);
  };

  // Restore on mount.
  useEffect(() => {
    if (!user) return;
    const d = loadDraft(user.id);
    if (d) {
      applySnapshot(d);
      localVersionRef.current = d.version;
      setDraftSavedAt(d.savedAt);
      setDraftRestoredFrom(d.savedAt);
      setSaveStatus("saved");
      // Prefill overrides empty fields on the restored draft.
      if (prefillGoalkeeper && !d.goalkeeper) setGoalkeeper(prefillGoalkeeper);
      if (prefillMatchDate && !d.matchDate) setMatchDate(prefillMatchDate);
      if (prefillOpponent && !d.opponent) setOpponent(prefillOpponent);
      if (prefillTeam && !d.team) setTeam(prefillTeam);
    } else {
      if (prefillGoalkeeper) setGoalkeeper(prefillGoalkeeper);
      if (prefillMatchDate) setMatchDate(prefillMatchDate);
      if (prefillOpponent) setOpponent(prefillOpponent);
      if (prefillTeam) setTeam(prefillTeam);
      setSaveStatus("idle");
    }
    setDraftLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Cross-tab watcher: another tab wrote to the same draft slot.
  useEffect(() => {
    if (!user) return;
    return subscribeDraftChanges(user.id, (remote) => {
      if (!remote) return; // remote cleared (submit/discard elsewhere)
      if (remote.tabId === tabIdRef.current) return; // our own write echoed
      if (remote.version <= localVersionRef.current) return; // stale
      // Only raise conflict if our unsaved snapshot actually differs.
      const mine = currentSnapshot();
      const differs =
        mine.goalkeeper !== remote.goalkeeper ||
        mine.coach !== remote.coach ||
        mine.team !== remote.team ||
        mine.opponent !== remote.opponent ||
        mine.matchDate !== remote.matchDate ||
        mine.comments !== remote.comments ||
        JSON.stringify(mine.scores) !== JSON.stringify(remote.scores) ||
        JSON.stringify(mine.selectedMedia) !== JSON.stringify(remote.selectedMedia);
      if (differs) raiseConflict(remote);
      else {
        // No local divergence — silently fast-forward.
        localVersionRef.current = remote.version;
        setDraftSavedAt(remote.savedAt);
        setSaveStatus("saved");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Autosave (debounced 5s). Blocked while a conflict is pending.
  useEffect(() => {
    if (!user || !draftLoaded || done || conflict) return;
    const snapshot = currentSnapshot();
    if (!isDraftMeaningful(snapshot)) {
      if (saveStatus !== "idle") setSaveStatus("idle");
      return;
    }
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const res = saveDraft(user.id, tabIdRef.current, localVersionRef.current, snapshot);
      if (res.ok) {
        localVersionRef.current = res.version;
        setDraftSavedAt(res.savedAt);
        setSaveStatus("saved");
      } else if ("conflict" in res) {
        raiseConflict(res.conflict);
        setSaveStatus("idle");
      } else {
        setSaveStatus("failed");
      }
    }, 5000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, draftLoaded, done, conflict, goalkeeper, coach, competition, team, opponent, matchDate, scores, comments, selectedMedia, voiceTranscript]);

  // Auto-fill Team from the roster when the goalkeeper matches a known player.
  // Only writes when Team is empty OR still equals the last auto-filled value —
  // a mentor's manual edit is never overwritten.
  useEffect(() => {
    if (!playersByName.size) return;
    const match = playersByName.get(goalkeeper.trim().toLowerCase());
    if (!match) return;
    const canOverwrite = !team.trim() || team === autoFilledTeamRef.current;
    if (!canOverwrite) return;
    if (team === match.current_club) return;
    setTeam(match.current_club);
    autoFilledTeamRef.current = match.current_club;
    setTeamAutoFilled(true);
  }, [goalkeeper, playersByName, team]);

  const handleTeamChange = (value: string) => {
    setTeam(value);
    if (value !== autoFilledTeamRef.current) {
      autoFilledTeamRef.current = null;
      setTeamAutoFilled(false);
    }
  };


  const discardDraft = () => {
    if (!user) return;
    clearDraft(user.id);
    setGoalkeeper("");
    setCompetition("");
    setTeam("");
    setOpponent("");
    setMatchDate(new Date().toISOString().slice(0, 10));
    setScores({
      protect_goal: 3, protect_space: 3, protect_air: 3,
      control_play: 3, change_play: 3, psych: 3, physical: 3,
    });
    setComments("");
    setSelectedMedia([]);
    setVoiceTranscript(null);
    setDraftSavedAt(null);
    setDraftRestoredFrom(null);
    localVersionRef.current = 0;
    setConflict(null);
    setSaveStatus("idle");
  };

  // Conflict resolution actions.
  const keepMine = () => {
    if (!user || !conflict) return;
    const res = overwriteDraft(user.id, tabIdRef.current, currentSnapshot());
    if (res.ok) {
      localVersionRef.current = res.version;
      setDraftSavedAt(res.savedAt);
      setConflict(null);
      setSaveStatus("saved");
    } else {
      setSaveStatus("failed");
    }
  };
  const useTheirs = () => {
    if (!conflict) return;
    applySnapshot(conflict);
    localVersionRef.current = conflict.version;
    setDraftSavedAt(conflict.savedAt);
    setDraftRestoredFrom(conflict.savedAt);
    setConflict(null);
    setSaveStatus("saved");
  };
  // Capture stable "mine" snapshot when a conflict arises; reset on clear.
  const raiseConflict = (remote: ReportDraft) => {
    preConflictLocalRef.current = currentSnapshot();
    setResolutions({});
    setConflict(remote);
  };
  useEffect(() => {
    if (!conflict) {
      preConflictLocalRef.current = null;
      setResolutions({});
    }
  }, [conflict]);

  type MediaDiff = { added: string[]; removed: string[]; kept: string[] };
  type Row = { key: string; label: string; mine: string; theirs: string; mediaDiff?: MediaDiff };

  const computeDiffRows = (mine: ReportDraftSnapshot, other: ReportDraft): Row[] => {
    const fmt = (v: unknown): string => {
      if (v == null || v === "") return "—";
      if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? "" : "s"}` : "—";
      return String(v);
    };
    const truncate = (s: string, n = 60) => s.length > n ? `${s.slice(0, n)}…` : s;
    const rows: Row[] = [];
    const push = (key: string, label: string, m: unknown, t: unknown) => {
      const ms = fmt(m); const ts = fmt(t);
      if (ms !== ts) rows.push({ key, label, mine: ms, theirs: ts });
    };
    push("goalkeeper", "Goalkeeper", mine.goalkeeper, other.goalkeeper);
    push("competition", "Competition", mine.competition, other.competition);
    push("team", "Team", mine.team, other.team);
    push("opponent", "Opponent", mine.opponent, other.opponent);
    push("matchDate", "Match date", mine.matchDate, other.matchDate);
    for (const pid of PILLAR_IDS) {
      push(`score.${pid}`, PILLAR_LABELS[pid], mine.scores[pid], other.scores?.[pid]);
    }
    if ((mine.comments || "") !== (other.comments || "")) {
      rows.push({ key: "comments", label: "Comments",
        mine: mine.comments ? truncate(mine.comments) : "—",
        theirs: other.comments ? truncate(other.comments) : "—" });
    }
    const mineIds = mine.selectedMedia ?? [];
    const theirIds = other.selectedMedia ?? [];
    const mineSet = new Set(mineIds);
    const theirSet = new Set(theirIds);
    const added = theirIds.filter((id) => !mineSet.has(id));
    const removed = mineIds.filter((id) => !theirSet.has(id));
    const kept = mineIds.filter((id) => theirSet.has(id));
    if (added.length || removed.length) {
      rows.push({
        key: "media",
        label: "Media attachments",
        mine: mineIds.length ? `${mineIds.length} attached` : "—",
        theirs: theirIds.length ? `${theirIds.length} attached` : "—",
        mediaDiff: { added, removed, kept },
      });
    }
    return rows;
  };

  const setFieldFromSnapshot = (key: string, snap: ReportDraftSnapshot) => {
    if (key.startsWith("score.")) {
      const pid = key.slice(6) as PillarId;
      setScores((prev) => ({ ...prev, [pid]: snap.scores[pid] }));
    } else if (key === "goalkeeper") setGoalkeeper(snap.goalkeeper);
    else if (key === "competition") setCompetition(snap.competition);
    else if (key === "team") setTeam(snap.team);
    else if (key === "opponent") setOpponent(snap.opponent);
    else if (key === "matchDate") { if (snap.matchDate) setMatchDate(snap.matchDate); }
    else if (key === "comments") setComments(snap.comments);
    else if (key === "media") setSelectedMedia([...snap.selectedMedia]);
  };
  const acceptField = (key: string) => {
    if (!conflict) return;
    setFieldFromSnapshot(key, conflict);
    setResolutions((prev) => ({ ...prev, [key]: "accepted" }));
  };
  const rejectField = (key: string) => {
    if (!preConflictLocalRef.current) return;
    setFieldFromSnapshot(key, preConflictLocalRef.current);
    setResolutions((prev) => ({ ...prev, [key]: "rejected" }));
  };
  const undoField = (key: string) => {
    if (!preConflictLocalRef.current) return;
    setFieldFromSnapshot(key, preConflictLocalRef.current);
    setResolutions((prev) => {
      const n = { ...prev }; delete n[key]; return n;
    });
  };

  // Auto-finalize when every diff row is resolved: persist the merged snapshot
  // and clear the conflict.
  useEffect(() => {
    if (!user || !conflict || !preConflictLocalRef.current) return;
    const rows = computeDiffRows(preConflictLocalRef.current, conflict);
    if (rows.length === 0) return;
    if (Object.keys(resolutions).length !== rows.length) return;
    const local = preConflictLocalRef.current;
    const merged: ReportDraftSnapshot = {
      ...local, scores: { ...local.scores }, selectedMedia: [...local.selectedMedia],
    };
    for (const r of rows) {
      if (resolutions[r.key] !== "accepted") continue;
      if (r.key.startsWith("score.")) {
        const pid = r.key.slice(6) as PillarId;
        if (conflict.scores?.[pid] != null) merged.scores[pid] = conflict.scores[pid];
      } else if (r.key === "goalkeeper") merged.goalkeeper = conflict.goalkeeper;
      else if (r.key === "competition") merged.competition = conflict.competition;
      else if (r.key === "team") merged.team = conflict.team;
      else if (r.key === "opponent") merged.opponent = conflict.opponent;
      else if (r.key === "matchDate") merged.matchDate = conflict.matchDate;
      else if (r.key === "comments") merged.comments = conflict.comments;
      else if (r.key === "media") merged.selectedMedia = [...(conflict.selectedMedia ?? [])];
    }
    const res = overwriteDraft(user.id, tabIdRef.current, merged);
    if (res.ok) {
      localVersionRef.current = res.version;
      setDraftSavedAt(res.savedAt);
      setDraftRestoredFrom(res.savedAt);
      setConflict(null);
      setSaveStatus("saved");
    } else {
      setSaveStatus("failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolutions, conflict]);

  // Fetch titles/kinds for any media IDs involved in the conflict so the diff
  // panel can show human-readable chips instead of raw counts.
  useEffect(() => {
    if (!conflict) return;
    const mineIds = preConflictLocalRef.current?.selectedMedia ?? selectedMedia;
    const union = Array.from(new Set([...mineIds, ...(conflict.selectedMedia ?? [])]));
    const missing = union.filter((id) => !mediaTitles[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    getMediaByIds(missing)
      .then((assets) => {
        if (cancelled) return;
        setMediaTitles((prev) => {
          const next = { ...prev };
          for (const a of assets) next[a.id] = {
            title: a.title,
            kind: a.media_type,
            thumbnailPath: a.thumbnail_path,
            filePath: a.file_path,
            mimeType: a.mime_type,
            fileSize: a.file_size,
            createdAt: a.created_at,
          };
          return next;
        });
      })
      .catch(() => { /* leave IDs; render fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict]);


  const retrySave = () => {
    if (!user) return;
    setSaveStatus("saving");
    const res = saveDraft(user.id, tabIdRef.current, localVersionRef.current, currentSnapshot());
    if (res.ok) {
      localVersionRef.current = res.version;
      setDraftSavedAt(res.savedAt);
      setSaveStatus("saved");
    } else if ("conflict" in res) {
      setConflict(res.conflict);
      setSaveStatus("idle");
    } else {
      setSaveStatus("failed");
    }
  };

  const liveAverage = useMemo(() => averageOfScores(scores), [scores]);

  if (done) {
    if (done.status === "queued") {
      return (
        <Submitted
          pending
          message="This report is queued locally. It has not yet been submitted to the RPM Match Reports Google Sheet, so it is not available to view yet."
          onDone={onDone}
        />
      );
    }
    return (
      <Submitted
        pending={!!done.interactionError}
        message={
          done.interactionError
            ? `Match report submitted to the RPM Match Reports Google Sheet · Average ${done.average.toFixed(1)}. The Live Match Observation interaction could NOT be created (${done.interactionError}), so it will not appear in the interactions log. Do not resubmit the report — tell an administrator.`
            : `Match report submitted to the RPM Match Reports Google Sheet · Average ${done.average.toFixed(1)}. A Live Match Observation interaction has been logged against this goalkeeper.`
        }
        onDone={onDone}
        action={{
          label: "Open submitted report",
          onClick: () => {
            onDone();
            void navigate({ to: "/reports/$reportId", params: { reportId: done.reportId } });
          },
        }}
      />
    );
  }

  const setScore = (id: PillarId, v: number) =>
    setScores((s) => ({ ...s, [id]: Math.max(1, Math.min(5, Math.round(v))) }));

  /**
   * The exact transcript appends without overwriting existing notes. An AI
   * rewrite is inserted as the editable report body; replacing existing
   * Comments always requires explicit confirmation.
   */
  const applyVoiceText = (text: string, mode: "replace" | "append") => {
    const incoming = text.trim();
    if (!incoming) return false;
    if (mode === "replace") {
      if (
        comments.trim() &&
        !window.confirm("Replace the current Comments with this AI rewrite? Your existing text will be removed.")
      ) {
        return false;
      }
      setComments(incoming);
    } else {
      setComments((previous) => appendCommentText(previous, incoming));
    }
    setCommentsError(null);
    return true;
  };

  /**
   * Handwritten-note OCR keeps its original user-controlled behaviour: the
   * mentor chooses replace or append. Append never deletes text the mentor
   * already wrote.
   */
  const applyOcrText = (text: string, mode: "replace" | "append") => {
    const incoming = text.trim();
    if (!incoming) return;
    setComments((prev) => mergeOcrText(prev, incoming, mode));
    setCommentsError(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doSubmit(false);
  };

  const doSubmit = async (force: boolean) => {
    if (submitting) return;
    setError(null);
    setDuplicate(null);
    setFieldErrors({});

    const normalisedComments = comments.trim();
    if (normalisedComments !== comments) setComments(normalisedComments);
    const check = validateComments(normalisedComments);
    if (!check.ok) {
      setCommentsError(check.message);
      commentsRef.current?.focus();
      return;
    }
    setCommentsError(null);
    setSubmitting(true);
    const payload = {
      goalkeeper: goalkeeper.trim(),
      coach: coach.trim(),
      competition: competition.trim(),
      team: team.trim(),
      opponent: opponent.trim(),
      match_date: matchDate,
      protect_goal: scores.protect_goal,
      protect_space: scores.protect_space,
      protect_air: scores.protect_air,
      control_play: scores.control_play,
      change_play: scores.change_play,
      psych: scores.psych,
      physical: scores.physical,
      comments: normalisedComments,
    };
    try {
      const res = await submitFn({
        data: {
          payload,
          options: {
            allowDuplicate: force,
            replay: false,
            submissionKey: submissionKeyRef.current,
          },
        },
      });
      if (res.status === "duplicate") {
        setDuplicate({ window: res.window, message: res.message });
        setSubmitting(false);
        return;
      }
      if (res.status === "in_progress" || res.status === "ambiguous") {
        // Never auto-retry: a second attempt could write a second sheet row.
        // Keep the same submission key so a deliberate retry stays idempotent.
        setError(res.message);
        setSubmitting(false);
        return;
      }

      submissionKeyRef.current = newSubmissionKey();
      if (selectedMedia.length > 0) {
        try {
          await attachMediaToReport(res.report_id, selectedMedia, user);
        } catch (attachErr) {
          console.warn("attachMediaToReport failed", attachErr);
        }
      }
      if (user) clearDraft(user.id);
      // The report also creates its Live Match Observation interaction, so the
      // log, timelines and Duty of Care must pick it up without a manual reload.
      await refreshInteractionViews(queryClient);
      setDone({
        status: "submitted",
        reportId: res.report_id,
        average: res.average,
        interactionError: res.interaction_error ?? null,
      });
      try { window.dispatchEvent(new CustomEvent("rpm:report-submitted", { detail: res })); } catch { /* ignore */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      if (/^Comments:/i.test(msg)) {
        setCommentsError(msg.replace(/^Comments:\s*/i, ""));
        return;
      }
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const transient = offline || /network|failed to fetch|load failed|timeout|fetch/i.test(msg);
      if (transient) {
        try {
          const { enqueueJob } = await import("@/lib/sync/queue");
          enqueueJob({
            type: "submitMatchReport",
            payload: { payload, submissionKey: submissionKeyRef.current },
            userId: user?.id,
            label: `Match report — ${payload.goalkeeper || "Unknown"} vs ${payload.opponent || "Unknown"}`,
          });
          if (user) clearDraft(user.id);
          setDone({ status: "queued" });
          try { window.dispatchEvent(new CustomEvent("rpm:report-queued")); } catch { /* ignore */ }
        } catch {
          setError(msg);
        }
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goalkeeper *">
          <input className={inputCls} required list="mr-gk-suggestions" value={goalkeeper}
            onChange={(e) => setGoalkeeper(e.target.value)}
            placeholder="e.g. James Beadle" maxLength={80} />
          <datalist id="mr-gk-suggestions">
            {(players.length ? players.map((p) => ({ id: p.id, name: p.full_name })) : goalkeepers.map((g) => ({ id: g.id, name: g.name }))).map((g) => (
              <option key={g.id} value={g.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Coach (you) *">
          <input className={`${inputCls} opacity-80 cursor-not-allowed`} required readOnly disabled value={coach} maxLength={80} />
        </Field>
        <Field label="Competition *">
          <input className={inputCls} required value={competition}
            list="mr-competition-suggestions"
            onChange={(e) => setCompetition(e.target.value)}
            placeholder="e.g. EFL Championship" maxLength={80} />
          <datalist id="mr-competition-suggestions">
            {Array.from(new Set([
              ...players.map((p) => p.league),
              ...goalkeepers.map((g) => g.league),
            ].filter(Boolean))).sort().map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Team *">
          <input className={inputCls} required value={team} onChange={(e) => handleTeamChange(e.target.value)}
            placeholder="e.g. Wolves" maxLength={80} />
          {teamAutoFilled && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Auto-filled from roster · edit to override
            </div>
          )}
        </Field>
        <Field label="Opponent *">
          <input className={inputCls} required value={opponent} onChange={(e) => setOpponent(e.target.value)}
            placeholder="e.g. Blackburn Rovers" maxLength={80} />
        </Field>
        <Field label="Match Date *">
          <input type="date" className={inputCls} required value={matchDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setMatchDate(e.target.value)} />
        </Field>
        <Field label="Average of scores">
          <div className="h-9 px-3 rounded-md border border-border/60 bg-muted/40 flex items-center text-sm font-semibold tabular-nums font-mono">
            {liveAverage.toFixed(1)}
          </div>
        </Field>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            RPM Pillar Scores (1–5)
          </div>
          <div className="text-[10px] text-muted-foreground">1 = poor · 5 = excellent</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PILLAR_IDS.map((id) => (
            <div key={id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border/60 bg-input/40">
              <label className="text-xs text-foreground/90 leading-tight">{PILLAR_LABELS[id]}</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = scores[id] === n;
                  return (
                    <button key={n} type="button" onClick={() => setScore(id, n)}
                      className={`size-7 rounded text-xs font-semibold tabular-nums font-mono transition-colors ${
                        active ? "bg-primary text-primary-foreground" : "bg-background border border-border text-muted-foreground hover:bg-accent/40"
                      }`}>{n}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <HandwrittenNotesField
        context={goalkeeper ? `Match notes on ${goalkeeper} vs ${opponent || "opponent"}` : undefined}
        destinationLabel="comments"
        onTranscribed={(text, mode) => applyOcrText(text, mode)}
      />
      <VoiceNoteField
        draft={voiceTranscript}
        onDraftChange={setVoiceTranscript}
        allowReplace={false}
        aiMode="report-rewrite"
        rewriteContext={{ goalkeeper, team, opponent, competition, matchDate }}
        onTranscribed={applyVoiceText}
        onAudioAttach={async ({ blob, mimeType, durationSec }) => {
          if (!user) throw new Error("Sign in required to save audio.");
          const gk = goalkeepers.find(
            (g) => g.name.trim().toLowerCase() === goalkeeper.trim().toLowerCase(),
          );
          if (!gk) throw new Error("Select a known goalkeeper before saving the voice note.");
          const ext = (mimeType.split("/")[1] || "webm").split(";")[0];
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `voice-note-${stamp}.${ext}`;
          const file = new File([blob], filename, { type: mimeType });
          const contextLabel = opponent
            ? `${gk.name} vs ${opponent} · ${matchDate}`
            : `${gk.name} · ${matchDate}`;
          const asset = await uploadMedia({
            file,
            gkId: gk.id,
            title: `Voice note — ${contextLabel}`,
            notes: `Recorded voice note (${Math.round(durationSec)}s) captured during Match Report submission.`,
            kind: "audio",
            ratingTags: ["Coaching point"],
            user,
          });
          setSelectedMedia((prev) => (prev.includes(asset.id) ? prev : [...prev, asset.id]));
        }}
      />
      <Field label="Comments *">
        <div className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Write a free-form match report, append the reviewed transcript, or use the editable AI rewrite above.
        </div>
        <textarea
          ref={commentsRef}
          rows={10}
          className={taCls}
          value={comments}
          onChange={(e) => {
            setComments(e.target.value);
            if (commentsError) setCommentsError(null);
          }}
          maxLength={5000}
          placeholder="Write the mentor's match observations here…"
        />
        <div className="mt-1 flex items-center justify-end gap-2">
          <span className="text-[10px] text-muted-foreground">
            Minimum 40 characters of match detail
          </span>
        </div>
        {commentsError && (
          <div className="mt-1 flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
            <span>{commentsError}</span>
          </div>
        )}
      </Field>

      {conflict && (() => {
        const mineSnap: ReportDraftSnapshot = preConflictLocalRef.current ?? {
          goalkeeper, coach, competition, team, opponent, matchDate, scores, comments, selectedMedia,
        };
        const rows = computeDiffRows(mineSnap, conflict);
        const resolvedCount = rows.reduce((n, r) => n + (resolutions[r.key] ? 1 : 0), 0);
        return (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="size-4 mt-0.5 text-amber-500 shrink-0" />
              <div className="text-xs leading-relaxed flex-1 min-w-0">
                <div className="font-semibold text-foreground">
                  Draft conflict detected
                  <span className="ml-2 font-normal text-muted-foreground">
                    {rows.length} field{rows.length === 1 ? "" : "s"} changed
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  Another tab saved this draft at <strong>{formatDraftTime(conflict.savedAt)}</strong>{" "}
                  (v{conflict.version}). Accept the other tab's value or reject to keep yours, per field.
                </div>
                {rows.length === 0 ? (
                  <div className="mt-2 text-[11px] text-muted-foreground italic">
                    No visible field differences — versions diverged but content matches.
                  </div>
                ) : (
                  <div className="mt-2 overflow-hidden rounded border border-border/60">
                    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)_auto] text-[11px]">
                      <div className="bg-background/70 px-2 py-1 font-medium text-muted-foreground uppercase tracking-wider">Field</div>
                      <div className="bg-background/70 px-2 py-1 font-medium text-muted-foreground uppercase tracking-wider border-l border-border/60">This tab</div>
                      <div className="bg-background/70 px-2 py-1 font-medium text-muted-foreground uppercase tracking-wider border-l border-border/60">Other tab</div>
                      <div className="bg-background/70 px-2 py-1 font-medium text-muted-foreground uppercase tracking-wider border-l border-border/60">Action</div>
                      {rows.map((r) => {
                        const state = resolutions[r.key];
                        const cellBase = "px-2 py-1 border-t border-l border-border/60";
                        const activeCell = "bg-amber-500/15";
                        const dimCell = "opacity-50";
                        const mineActive = state === "rejected" || !state;
                        const theirsActive = state === "accepted" || !state;
                        const md = r.mediaDiff;
                        const bothSides = md && md.added.length > 0 && md.removed.length > 0;
                        return (
                          <Fragment key={r.key}>
                            <div className="px-2 py-1 border-t border-border/60 text-foreground/80 truncate">
                              {r.label}
                              {md && (
                                <div className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal mt-0.5">
                                  {bothSides ? "replaced · " : ""}
                                  {md.added.length > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{md.added.length}</span>}
                                  {md.added.length > 0 && md.removed.length > 0 && " / "}
                                  {md.removed.length > 0 && <span className="text-rose-600 dark:text-rose-400">−{md.removed.length}</span>}
                                  {md.kept.length > 0 && <span className="text-muted-foreground"> · {md.kept.length} kept</span>}
                                </div>
                              )}
                            </div>
                            <div className={`${cellBase} ${mineActive ? activeCell : dimCell}`}>
                              {md ? (
                                <div className="flex flex-wrap gap-1">
                                  {md.removed.length === 0 && md.kept.length === 0 && (
                                    <span className="text-muted-foreground italic">nothing attached</span>
                                  )}
                                  {md.removed.map((id) => (
                                    <MediaChipPreview key={id} id={id} info={mediaTitles[id]} tone="removed" />
                                  ))}
                                  {md.kept.map((id) => (
                                    <MediaChipPreview key={id} id={id} info={mediaTitles[id]} tone="kept" />
                                  ))}
                                </div>
                              ) : (
                                <span className="rounded px-1 bg-amber-500/20 text-foreground break-words">{r.mine}</span>
                              )}
                            </div>
                            <div className={`${cellBase} ${theirsActive ? activeCell : dimCell}`}>
                              {md ? (
                                <div className="flex flex-wrap gap-1">
                                  {md.added.length === 0 && md.kept.length === 0 && (
                                    <span className="text-muted-foreground italic">nothing attached</span>
                                  )}
                                  {md.added.map((id) => (
                                    <MediaChipPreview key={id} id={id} info={mediaTitles[id]} tone="added" />
                                  ))}
                                  {md.kept.map((id) => (
                                    <MediaChipPreview key={id} id={id} info={mediaTitles[id]} tone="kept" />
                                  ))}
                                </div>
                              ) : (
                                <span className="rounded px-1 bg-amber-500/20 text-foreground break-words">{r.theirs}</span>
                              )}
                            </div>
                            <div className={`${cellBase} whitespace-nowrap`}>
                              {state ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px]">
                                  <span className={state === "accepted" ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground font-medium"}>
                                    {state === "accepted" ? "Accepted remote" : "Kept local"}
                                  </span>
                                  <button type="button" onClick={() => undoField(r.key)}
                                    className="underline text-muted-foreground hover:text-foreground">
                                    Undo
                                  </button>
                                </span>
                              ) : (
                                <div className="inline-flex rounded border border-border overflow-hidden">
                                  <button type="button" onClick={() => rejectField(r.key)}
                                    aria-label={`Reject remote change for ${r.label}`}
                                    className="px-1.5 py-0.5 text-[10px] bg-background text-muted-foreground hover:text-foreground hover:bg-muted">
                                    Reject
                                  </button>
                                  <button type="button" onClick={() => acceptField(r.key)}
                                    aria-label={`Accept remote change for ${r.label}`}
                                    className="px-1.5 py-0.5 text-[10px] border-l border-border bg-primary text-primary-foreground hover:opacity-90">
                                    Accept
                                  </button>
                                </div>
                              )}
                            </div>
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {rows.length > 0 && (
                <span className="text-[11px] text-muted-foreground mr-auto">
                  {resolvedCount} of {rows.length} resolved
                </span>
              )}
              <button type="button"
                onClick={() => exportConflictJson(buildConflictSummary(rows, conflict, mediaTitles))}
                className="h-8 px-3 rounded-md border border-border text-xs"
                title="Download a machine-readable summary of this conflict">
                Export JSON
              </button>
              <button type="button"
                onClick={() => { void exportConflictPdf(buildConflictSummary(rows, conflict, mediaTitles)); }}
                className="h-8 px-3 rounded-md border border-border text-xs"
                title="Download a printable summary of this conflict">
                Export PDF
              </button>
              <button type="button" onClick={useTheirs}
                className="h-8 px-3 rounded-md border border-border text-xs">
                Use other tab's version
              </button>
              <button type="button" onClick={keepMine}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium">
                Keep this tab's version
              </button>
            </div>
          </div>
        );
      })()}

      {duplicate && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 mt-0.5 text-amber-500 shrink-0" />
            <div>
              <div className="font-semibold text-foreground">
                {duplicate.window === "strong" ? "Possible double submission" : "Similar report already submitted"}
              </div>
              <div className="text-muted-foreground mt-0.5">{duplicate.message}</div>
              <div className="text-muted-foreground mt-1">
                Nothing has been written to the sheet. If this is a genuinely separate
                report, confirm below.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void doSubmit(true)}
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11px] text-foreground disabled:opacity-60"
            >
              Submit duplicate anyway
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setDuplicate(null)}
              className="h-7 px-2.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive flex items-start gap-1.5">
          <AlertCircle className="size-3.5 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
        <div className="text-[11px] flex items-center gap-2 min-h-6">
          {draftRestoredFrom && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/40 text-foreground/80">
              Draft restored from {formatDraftTime(draftRestoredFrom)}
            </span>
          )}
          <DraftStatusIndicator status={saveStatus} savedAt={draftSavedAt} onRetry={retrySave} />
          {draftSavedAt && (
            <button type="button" onClick={discardDraft} disabled={submitting}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="size-3" /> Discard draft
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="h-9 px-3 rounded-md border border-border text-sm" disabled={submitting}>Cancel</button>
          <button
            type="submit"
            disabled={submitting || !!conflict}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitting ? "Submitting…" : "Submit Match Report"}
          </button>
        </div>
      </div>
    </form>
  );
}

function MediaAttachPicker({
  gkId, selected, onChange, user,
}: {
  gkId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  user: SessionUser | null;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setAssets(await listMedia({ gkId })); } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [gkId]); // eslint-disable-line

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return assets;
    return assets.filter((a) => a.title.toLowerCase().includes(s) || (a.notes ?? "").toLowerCase().includes(s));
  }, [assets, search]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="space-y-2 border border-border rounded-md p-3 bg-background/40">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium inline-flex items-center gap-1.5">
          <Paperclip className="size-3.5" />Attach Media {selected.length > 0 && <span className="text-primary normal-case">· {selected.length} selected</span>}
        </div>
        {user && (
          <button type="button" onClick={() => setShowUpload((v) => !v)} className="text-[11px] text-primary hover:underline">
            {showUpload ? "Cancel upload" : "Upload new"}
          </button>
        )}
      </div>

      {showUpload && user && (
        <InlineUploader gkId={gkId} user={user} onUploaded={async (asset) => {
          await load();
          onChange([...selected, asset.id]);
          setShowUpload(false);
        }} />
      )}

      <div className="relative">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search existing media for this goalkeeper…" className="w-full h-8 pl-7 pr-2 rounded-md bg-input/60 border border-border text-xs" />
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {loading ? (
          <div className="text-xs text-muted-foreground py-2">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">No existing media for this goalkeeper.</div>
        ) : filtered.map((a) => {
          const active = selected.includes(a.id);
          return (
            <label key={a.id} className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer ${active ? "border-primary/40 bg-primary/10" : "border-border hover:bg-accent/30"}`}>
              <input type="checkbox" checked={active} onChange={() => toggle(a.id)} className="size-3.5" />
              <span className="flex-1 truncate">{a.title}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{a.media_type}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function InlineUploader({ gkId, user, onUploaded }: { gkId: string; user: SessionUser; onUploaded: (a: MediaAsset) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onPick = async (file: File | null) => {
    if (!file) return;
    setErr(null);
    const kind = detectKind(file);
    if (!kind) { setErr("Unsupported file type."); return; }
    if (file.size > MAX_FILE_BYTES) { setErr(`File exceeds ${formatBytes(MAX_FILE_BYTES)}.`); return; }
    setBusy(true);
    try {
      const asset = await uploadMedia({ file, gkId, title: file.name.replace(/\.[^.]+$/, ""), kind, user });
      window.dispatchEvent(new CustomEvent("rpm:media-uploaded"));
      onUploaded(asset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(false); }
  };
  return (
    <div className="border border-dashed border-border rounded-md p-2 text-xs flex items-center gap-2">
      <label className="cursor-pointer inline-flex items-center gap-1.5 px-2 py-1 rounded bg-primary text-primary-foreground">
        <Upload className="size-3" />{busy ? "Uploading…" : "Choose file"}
        <input type="file" className="hidden" disabled={busy} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      <span className="text-muted-foreground">Up to {formatBytes(MAX_FILE_BYTES)} · video/image/PDF/audio</span>
      {err && <span className="text-red-400 ml-auto">{err}</span>}
    </div>
  );
}

const KIND_LABELS: { value: MediaKind; label: string }[] = [
  { value: "video", label: "Video clip" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Voice note" },
];

function MediaForm({ onDone, prefillGkId }: { onDone: () => void; prefillGkId?: string }) {
  const { user, can } = useAuth();
  const [done, setDone] = useState(false);
  const [kind, setKind] = useState<MediaKind>("video");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [gkId, setGkId] = useState(prefillGkId ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mentors work collaboratively — any mentor can link media to any goalkeeper.
  const allowedGks = useMemo(() => goalkeepers, []);

  if (!user || !can("media.upload")) {
    return (
      <div className="text-sm text-muted-foreground flex items-start gap-2 p-2">
        <AlertCircle className="size-4 text-amber-400 mt-0.5" />
        <span>Your role doesn't have permission to upload media. Contact an admin.</span>
      </div>
    );
  }

  if (done) return <Submitted message="Media uploaded and linked to the goalkeeper." onDone={onDone} />;

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) { setError(`File is ${formatBytes(f.size)} — limit is ${formatBytes(MAX_FILE_BYTES)}.`); return; }
    const detected = detectKind(f);
    if (detected) setKind(detected);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) { setError("Please choose a file to upload."); return; }
    if (!gkId) { setError("Please select a goalkeeper."); return; }
    setBusy(true);
    try {
      await uploadMedia({ file, gkId, title: title.trim() || file.name, notes, kind, ratingTags: tags, user });
      window.dispatchEvent(new CustomEvent("rpm:media-uploaded"));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Media Type">
          <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as MediaKind)}>
            {KIND_LABELS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Linked Goalkeeper">
          <select className={selectCls} required value={gkId} onChange={(e) => setGkId(e.target.value)}>
            <option value="" disabled>Select…</option>
            {allowedGks.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.club}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Title">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Match clip vs derby — 2nd half" required />
      </Field>
      <Field label="File">
        <label className="flex flex-col items-center justify-center gap-1.5 h-32 rounded-md border-2 border-dashed border-border hover:border-primary/40 cursor-pointer bg-input/30 px-4 text-center">
          {file ? (
            <>
              <Upload className="size-5 text-primary" />
              <span className="text-sm font-medium truncate max-w-full">{file.name}</span>
              <span className="text-[11px] text-muted-foreground">{formatBytes(file.size)} · {file.type || "unknown type"}</span>
            </>
          ) : (
            <>
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">Click to select a file</span>
              <span className="text-[11px] text-muted-foreground">Up to 200MB · video, audio, image or PDF</span>
            </>
          )}
          <input type="file" className="hidden" accept={ACCEPT_BY_KIND[kind]} onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </label>
      </Field>
      <Field label="Rating Tags"><TagPicker value={tags} onChange={setTags} /></Field>
      <Field label="Notes"><textarea rows={3} className={taCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for reviewers…" /></Field>
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-2">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="h-9 px-3 rounded-md border border-border text-sm" disabled={busy}>Cancel</button>
        <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

function EditMediaForm({ asset, onDone }: { asset: MediaAsset; onDone: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(asset.title);
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [kind, setKind] = useState<MediaKind>(asset.media_type);
  const [gkId, setGkId] = useState(asset.gk_id);
  const [tags, setTags] = useState<string[]>(asset.rating_tags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Mentors work collaboratively — any mentor can link media to any goalkeeper.
  const allowedGks = useMemo(() => goalkeepers, []);

  if (done) return <Submitted message="Media updated." onDone={onDone} />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await updateMedia(asset.id, { title: title.trim(), notes: notes || null, media_type: kind, gk_id: gkId, rating_tags: tags }, user, asset);
      window.dispatchEvent(new CustomEvent("rpm:media-updated"));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Media Type">
          <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as MediaKind)}>
            {KIND_LABELS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Linked Goalkeeper">
          <select className={selectCls} value={gkId} onChange={(e) => setGkId(e.target.value)}>
            {allowedGks.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.club}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Rating Tags"><TagPicker value={tags} onChange={setTags} /></Field>
      <Field label="Notes"><textarea rows={3} className={taCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="h-9 px-3 rounded-md border border-border text-sm" disabled={busy}>Cancel</button>
        <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function GoalkeeperForm({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  if (done) return <Submitted message="Goalkeeper added to the database." onDone={onDone} />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setDone(true); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full Name"><input className={inputCls} placeholder="e.g. Aiden Walsh" required /></Field>
        <Field label="Date of Birth"><input type="date" className={inputCls} /></Field>
        <Field label="Nationality"><input className={inputCls} placeholder="e.g. Ireland" /></Field>
        <Field label="Club"><input className={inputCls} placeholder="e.g. Shamrock Rovers" /></Field>
        <Field label="League"><input className={inputCls} placeholder="e.g. League of Ireland" /></Field>
        <Field label="Height"><input className={inputCls} placeholder="e.g. 192cm" /></Field>
        <Field label="Status"><select className={selectCls}>{["Tier 1", "Tier 2", "Tier 3", "Tier 4", "Academy", "Free Agent"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Contract Until"><input type="date" className={inputCls} /></Field>
        <Field label="Recommendation"><select className={selectCls}>{["Monitor", "Sign", "Loan", "Develop", "Retain", "Pass"].map((t) => <option key={t}>{t}</option>)}</select></Field>
      </div>
      <Field label="Initial Scouting Notes"><textarea rows={4} className={taCls} placeholder="Profile summary, source, context…" /></Field>
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onDone} className="h-9 px-3 rounded-md border border-border text-sm">Cancel</button><button type="submit" className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">Add Goalkeeper</button></div>
    </form>
  );
}

// ---------- Inline media preview for the conflict diff ----------

const thumbUrlCache = new Map<string, string>();
const waveformCache = new Map<string, number[]>();

async function computeWaveform(url: string, bars = 32): Promise<number[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("audio fetch failed");
  const buf = await res.arrayBuffer();
  const AC: typeof AudioContext =
    (window.AudioContext as typeof AudioContext) ||
    ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext as typeof AudioContext);
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / bars));
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * step;
      const end = Math.min(data.length, start + step);
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
      if (peak > max) max = peak;
    }
    return peaks.map((p) => (max > 0 ? p / max : 0));
  } finally {
    try { await ctx.close(); } catch { /* noop */ }
  }
}

const MAX_WAVEFORM_BYTES = 8 * 1024 * 1024;
const MAX_PDF_PAGECOUNT_BYTES = 6 * 1024 * 1024;

const durationCache = new Map<string, number>();
const pageCountCache = new Map<string, number>();

function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "—";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const rr = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${rr}` : `${mm}:${rr}`;
}

function formatUploadedDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function basename(path: string): string {
  const b = path.split("/").pop() || path;
  // strip our upload prefix `${ts}-${rand}-`
  return b.replace(/^\d{10,}-[a-z0-9]{4,10}-/i, "");
}

async function probeMediaDuration(url: string, kind: "audio" | "video"): Promise<number> {
  return new Promise((resolve, reject) => {
    const el: HTMLMediaElement = kind === "video" ? document.createElement("video") : document.createElement("audio");
    el.preload = "metadata";
    el.muted = true;
    const cleanup = () => { el.src = ""; el.remove(); };
    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      resolve(Number.isFinite(d) ? d : NaN);
    };
    el.onerror = () => { cleanup(); reject(new Error("duration probe failed")); };
    el.src = url;
  });
}

async function probePdfPageCount(url: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("pdf fetch failed");
  const text = await res.text();
  // Prefer the root /Pages object's /Count.
  const rootMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/);
  if (rootMatch) return parseInt(rootMatch[1], 10);
  // Fallback: count Page objects (not Pages).
  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
  if (pageMatches) return pageMatches.length;
  throw new Error("page count not found");
}

function MediaChipPreview({ id, info, tone }: {
  id: string;
  info: MediaChipInfo | undefined;
  tone: "added" | "removed" | "kept";
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(
    info?.thumbnailPath ? thumbUrlCache.get(info.thumbnailPath) ?? null : null,
  );
  const [wave, setWave] = useState<number[] | null>(
    info?.kind === "audio" ? waveformCache.get(id) ?? null : null,
  );
  const [duration, setDuration] = useState<number | null>(
    info && (info.kind === "audio" || info.kind === "video") ? durationCache.get(id) ?? null : null,
  );
  const [pageCount, setPageCount] = useState<number | null>(
    info?.kind === "pdf" ? pageCountCache.get(id) ?? null : null,
  );

  // Signed URL for image/video thumbnail
  useEffect(() => {
    if (!info?.thumbnailPath) return;
    const cached = thumbUrlCache.get(info.thumbnailPath);
    if (cached) { setThumbUrl(cached); return; }
    let cancelled = false;
    getSignedUrl(info.thumbnailPath, 3600)
      .then((u) => {
        if (cancelled) return;
        thumbUrlCache.set(info.thumbnailPath!, u);
        setThumbUrl(u);
      })
      .catch(() => { /* fall back to icon */ });
    return () => { cancelled = true; };
  }, [info?.thumbnailPath]);

  // Waveform for audio (bounded by size)
  useEffect(() => {
    if (!info || info.kind !== "audio") return;
    if (waveformCache.has(id)) { setWave(waveformCache.get(id)!); return; }
    if (info.fileSize && info.fileSize > MAX_WAVEFORM_BYTES) return;
    let cancelled = false;
    getSignedUrl(info.filePath, 3600)
      .then((u) => computeWaveform(u))
      .then((peaks) => {
        if (cancelled) return;
        waveformCache.set(id, peaks);
        setWave(peaks);
      })
      .catch(() => { /* fall back to icon */ });
    return () => { cancelled = true; };
  }, [id, info?.kind, info?.filePath, info?.fileSize]);

  // Duration for audio/video
  useEffect(() => {
    if (!info || (info.kind !== "audio" && info.kind !== "video")) return;
    if (durationCache.has(id)) { setDuration(durationCache.get(id)!); return; }
    let cancelled = false;
    getSignedUrl(info.filePath, 3600)
      .then((u) => probeMediaDuration(u, info.kind as "audio" | "video"))
      .then((d) => {
        if (cancelled || !Number.isFinite(d)) return;
        durationCache.set(id, d);
        setDuration(d);
      })
      .catch(() => { /* leave null */ });
    return () => { cancelled = true; };
  }, [id, info?.kind, info?.filePath]);

  // Page count for PDF (bounded)
  useEffect(() => {
    if (!info || info.kind !== "pdf") return;
    if (pageCountCache.has(id)) { setPageCount(pageCountCache.get(id)!); return; }
    if (info.fileSize && info.fileSize > MAX_PDF_PAGECOUNT_BYTES) return;
    let cancelled = false;
    getSignedUrl(info.filePath, 3600)
      .then((u) => probePdfPageCount(u))
      .then((n) => {
        if (cancelled) return;
        pageCountCache.set(id, n);
        setPageCount(n);
      })
      .catch(() => { /* leave null */ });
    return () => { cancelled = true; };
  }, [id, info?.kind, info?.filePath, info?.fileSize]);

  const toneCls =
    tone === "added"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : tone === "removed"
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
        : "bg-background text-foreground/70 border-border";

  const kindGlyph =
    info?.kind === "video" ? "🎬" :
    info?.kind === "pdf" ? "📄" :
    info?.kind === "image" ? "🖼️" :
    info?.kind === "audio" ? "🔊" : "📎";

  const title = info?.title ?? `…${id.slice(-6)}`;
  const filename = info ? basename(info.filePath) : "";
  const uploadedLabel = info?.createdAt ? formatUploadedDate(info.createdAt) : "";
  const sizeLabel = info?.fileSize != null ? formatBytes(info.fileSize) : "";
  const primaryDetail =
    info?.kind === "audio" || info?.kind === "video"
      ? (duration != null ? formatDuration(duration) : "…")
      : info?.kind === "pdf"
        ? (pageCount != null ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : "PDF")
        : "";

  const titleHint =
    (tone === "added" ? "Only in other tab — will be added if you accept remote" :
      tone === "removed" ? "Only in this tab — will be removed if you accept remote" :
      "In both drafts") +
    (info ? `\n${filename}${primaryDetail ? " · " + primaryDetail : ""}${sizeLabel ? " · " + sizeLabel : ""}${uploadedLabel ? " · uploaded " + uploadedLabel : ""}` : "");

  // Preview visual
  let preview: ReactNode = null;
  if (thumbUrl && (info?.kind === "image" || info?.kind === "video")) {
    preview = (
      <span className="relative size-9 shrink-0 rounded overflow-hidden border border-border/60 bg-background">
        <img src={thumbUrl} alt="" className="size-full object-cover" loading="lazy" />
        {info?.kind === "video" && (
          <span className="absolute inset-0 flex items-center justify-center text-white text-[11px] drop-shadow">▶</span>
        )}
      </span>
    );
  } else if (info?.kind === "pdf") {
    preview = (
      <span className="size-9 shrink-0 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 flex flex-col items-center justify-center leading-none">
        <span className="text-[9px] font-bold tracking-wider">PDF</span>
        <span className="text-[8px] opacity-70">{pageCount != null ? `${pageCount}p` : "p.1"}</span>
      </span>
    );
  } else if (info?.kind === "audio") {
    preview = (
      <span className="size-9 shrink-0 rounded border border-border/60 bg-background flex items-center justify-center px-0.5">
        <Waveform peaks={wave} />
      </span>
    );
  } else {
    preview = (
      <span className="size-9 shrink-0 rounded border border-border/60 bg-background flex items-center justify-center text-sm">
        {kindGlyph}
      </span>
    );
  }

  const metaParts: string[] = [];
  if (primaryDetail) metaParts.push(primaryDetail);
  if (sizeLabel) metaParts.push(sizeLabel);
  if (uploadedLabel) metaParts.push(uploadedLabel);

  const titleCls =
    tone === "removed" ? "line-through decoration-rose-500/60 truncate font-medium" : "truncate font-medium";

  return (
    <span
      title={titleHint}
      className={`inline-flex items-start gap-2 rounded pl-1 pr-2 py-1 border text-[11px] max-w-[18rem] ${toneCls}`}
    >
      {preview}
      <span className="min-w-0 flex flex-col leading-tight">
        <span className={titleCls}>
          {tone === "added" && <span className="font-semibold mr-0.5">+</span>}
          {title}
        </span>
        {filename && filename !== title && (
          <span className="text-[10px] opacity-75 truncate">{filename}</span>
        )}
        {metaParts.length > 0 && (
          <span className="text-[10px] opacity-70 truncate tabular-nums font-mono">
            {metaParts.join(" · ")}
          </span>
        )}
      </span>
    </span>
  );
}

function Waveform({ peaks }: { peaks: number[] | null }) {
  const bars = peaks ?? Array.from({ length: 20 }, (_, i) => 0.25 + 0.35 * Math.abs(Math.sin(i * 1.7)));
  const isReal = peaks !== null;
  return (
    <span className="flex items-center gap-[1px] h-full w-full">
      {bars.map((v, i) => (
        <span
          key={i}
          className={`inline-block flex-1 rounded-sm ${isReal ? "bg-foreground/70" : "bg-foreground/30"}`}
          style={{ height: `${Math.max(10, Math.round(v * 100))}%` }}
        />
      ))}
    </span>
  );
}

// ---------- Conflict summary export ----------

type ExportItem = {
  id: string;
  title: string;
  filename: string;
  kind: MediaKind | "unknown";
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string | null;
};

type FieldChange = { field: string; label: string; thisTab: string; otherTab: string };

type ConflictSummary = {
  generatedAt: string;
  savedAt: string;
  otherVersion: number;
  totals: { added: number; removed: number; replacedFields: number; kept: number; fieldChanges: number };
  media: {
    added: ExportItem[];
    removed: ExportItem[];
    kept: ExportItem[];
    replacedFields: { field: string; added: ExportItem[]; removed: ExportItem[] }[];
  };
  fieldChanges: FieldChange[];
};

function toExportItem(id: string, info: MediaChipInfo | undefined): ExportItem {
  if (!info) {
    return { id, title: `(unknown ${id.slice(-6)})`, filename: "", kind: "unknown", mimeType: null, fileSizeBytes: null, uploadedAt: null };
  }
  const b = info.filePath.split("/").pop() || info.filePath;
  const filename = b.replace(/^\d{10,}-[a-z0-9]{4,10}-/i, "");
  return {
    id,
    title: info.title,
    filename,
    kind: info.kind,
    mimeType: info.mimeType,
    fileSizeBytes: info.fileSize,
    uploadedAt: info.createdAt ?? null,
  };
}

function buildConflictSummary(
  rows: { key: string; label: string; mine: string; theirs: string; mediaDiff?: { added: string[]; removed: string[]; kept: string[] } }[],
  conflict: ReportDraft,
  mediaTitles: Record<string, MediaChipInfo>,
): ConflictSummary {
  const addedIds = new Set<string>();
  const removedIds = new Set<string>();
  const keptIds = new Set<string>();
  const replacedFields: { field: string; added: ExportItem[]; removed: ExportItem[] }[] = [];
  const fieldChanges: FieldChange[] = [];

  for (const r of rows) {
    if (r.mediaDiff) {
      const { added, removed, kept } = r.mediaDiff;
      added.forEach((id) => addedIds.add(id));
      removed.forEach((id) => removedIds.add(id));
      kept.forEach((id) => keptIds.add(id));
      if (added.length > 0 && removed.length > 0) {
        replacedFields.push({
          field: r.label,
          added: added.map((id) => toExportItem(id, mediaTitles[id])),
          removed: removed.map((id) => toExportItem(id, mediaTitles[id])),
        });
      }
    } else {
      fieldChanges.push({ field: r.key, label: r.label, thisTab: r.mine, otherTab: r.theirs });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    savedAt: conflict.savedAt,
    otherVersion: conflict.version,
    totals: {
      added: addedIds.size,
      removed: removedIds.size,
      replacedFields: replacedFields.length,
      kept: keptIds.size,
      fieldChanges: fieldChanges.length,
    },
    media: {
      added: [...addedIds].map((id) => toExportItem(id, mediaTitles[id])),
      removed: [...removedIds].map((id) => toExportItem(id, mediaTitles[id])),
      kept: [...keptIds].map((id) => toExportItem(id, mediaTitles[id])),
      replacedFields,
    },
    fieldChanges,
  };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function exportConflictJson(summary: ConflictSummary) {
  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
  triggerDownload(blob, `draft-conflict-${timestampSlug()}.json`);
}

async function exportConflictPdf(summary: ConflictSummary) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const line = (text: string, opts?: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number }) => {
    const size = opts?.size ?? 10;
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const [r, g, b] = opts?.color ?? [30, 30, 30];
    doc.setTextColor(r, g, b);
    const indent = opts?.indent ?? 0;
    const wrapped = doc.splitTextToSize(text, pageW - margin * 2 - indent);
    const lineH = size * 1.25;
    for (const w of wrapped) {
      ensureRoom(lineH);
      doc.text(w, margin + indent, y);
      y += lineH;
    }
  };
  const gap = (h = 8) => { y += h; };
  const hr = () => {
    ensureRoom(10);
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  };

  const fmtBytes = (n: number | null) => n == null ? "—" : (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };
  const kindLabel = (k: string) => k === "unknown" ? "file" : k;

  // Header
  line("Draft Conflict Summary", { size: 18, bold: true });
  gap(2);
  line(`Generated ${new Date(summary.generatedAt).toLocaleString()}`, { size: 9, color: [110, 110, 110] });
  line(`Other tab saved at ${new Date(summary.savedAt).toLocaleString()} (v${summary.otherVersion})`, { size: 9, color: [110, 110, 110] });
  gap(4);
  hr();

  // Totals
  line("Totals", { size: 12, bold: true });
  line(`Media added: ${summary.totals.added}   ·   removed: ${summary.totals.removed}   ·   kept: ${summary.totals.kept}`);
  line(`Fields with replacements: ${summary.totals.replacedFields}   ·   Non-media field changes: ${summary.totals.fieldChanges}`);
  gap(6);
  hr();

  const renderItem = (it: ExportItem, prefix: string, color: [number, number, number]) => {
    line(`${prefix} ${it.title}`, { size: 10, bold: true, color, indent: 6 });
    const details: string[] = [];
    if (it.filename && it.filename !== it.title) details.push(it.filename);
    details.push(kindLabel(it.kind));
    if (it.mimeType) details.push(it.mimeType);
    details.push(fmtBytes(it.fileSizeBytes));
    details.push(`uploaded ${fmtDate(it.uploadedAt)}`);
    details.push(`id ${it.id}`);
    line(details.join(" · "), { size: 8, color: [110, 110, 110], indent: 18 });
    gap(2);
  };

  // Added
  line(`Added (${summary.media.added.length})`, { size: 12, bold: true, color: [16, 122, 74] });
  if (summary.media.added.length === 0) line("None", { size: 9, color: [140, 140, 140], indent: 6 });
  else summary.media.added.forEach((it) => renderItem(it, "+", [16, 122, 74]));
  gap(4);

  // Removed
  line(`Removed (${summary.media.removed.length})`, { size: 12, bold: true, color: [176, 47, 62] });
  if (summary.media.removed.length === 0) line("None", { size: 9, color: [140, 140, 140], indent: 6 });
  else summary.media.removed.forEach((it) => renderItem(it, "−", [176, 47, 62]));
  gap(4);

  // Replaced (per-field)
  line(`Replaced fields (${summary.media.replacedFields.length})`, { size: 12, bold: true, color: [170, 110, 20] });
  if (summary.media.replacedFields.length === 0) {
    line("None", { size: 9, color: [140, 140, 140], indent: 6 });
  } else {
    for (const rf of summary.media.replacedFields) {
      line(rf.field, { size: 10, bold: true, indent: 6 });
      rf.removed.forEach((it) => renderItem(it, "−", [176, 47, 62]));
      rf.added.forEach((it) => renderItem(it, "+", [16, 122, 74]));
      gap(2);
    }
  }
  gap(4);

  // Kept (compact)
  if (summary.media.kept.length > 0) {
    hr();
    line(`Kept in both drafts (${summary.media.kept.length})`, { size: 11, bold: true, color: [80, 80, 80] });
    for (const it of summary.media.kept) {
      line(`• ${it.title}${it.filename && it.filename !== it.title ? ` — ${it.filename}` : ""}`, { size: 9, color: [80, 80, 80], indent: 6 });
    }
  }

  // Field changes
  if (summary.fieldChanges.length > 0) {
    gap(6);
    hr();
    line(`Non-media field changes (${summary.fieldChanges.length})`, { size: 12, bold: true });
    for (const f of summary.fieldChanges) {
      line(f.label, { size: 10, bold: true, indent: 6 });
      line(`This tab: ${f.thisTab || "(empty)"}`, { size: 9, color: [80, 80, 80], indent: 18 });
      line(`Other tab: ${f.otherTab || "(empty)"}`, { size: 9, color: [80, 80, 80], indent: 18 });
      gap(2);
    }
  }

  doc.save(`draft-conflict-${timestampSlug()}.pdf`);
}
