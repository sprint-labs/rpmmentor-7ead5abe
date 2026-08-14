import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Mic,
  Square,
  Loader2,
  X,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  History,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { transcribeVoiceNote } from "@/lib/api/transcribe.functions";
import {
  rewriteTranscript,
  summarizeTranscript,
  type FixtureContext,
  type StructuredSummary,
} from "@/lib/api/summarize.functions";
import { LatestRequestGate } from "@/lib/async/latest-request";
import type { InteractionRecording } from "@/lib/interactions/audio";

const MAX_SECONDS = 180;
const TRANSCRIPTION_FAILURE_MESSAGE =
  "We could not process this audio recording. Your recording is still available. Please retry or save it without a transcript.";

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "audio/webm";
}

function deriveAudioFileName(mimeType: string): string {
  const baseMime = normalizeMimeType(mimeType);
  const ext = AUDIO_EXTENSION_BY_MIME[baseMime] ?? "webm";
  return `voice-note-${Date.now()}.${ext}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface TranscriptVersion {
  at: string;
  text: string;
  source: "ai" | "edit" | "saved";
  label?: string;
}

interface VoiceDraft {
  transcript: string;
  tokens: Array<{ token: string; confidence: number }>;
  avgConfidence: number | null;
  reviewed: boolean;
  rewrite?: string | null;
  original?: TranscriptVersion | null;
  versions?: TranscriptVersion[];
}

interface AttemptLogEntry {
  id: string;
  timestamp: number;
  status: "started" | "success" | "error";
  message?: string;
}

interface Props {
  onTranscribed: (text: string, mode: "replace" | "append") => boolean | void;
  onAudioAttach?: (audio: {
    blob: Blob;
    mimeType: string;
    durationSec: number;
  }) => void | Promise<void>;
  /**
   * Hand the raw recording to the parent as soon as it exists, and `null` when
   * it is discarded.
   *
   * Distinct from `onAudioAttach`, which uploads immediately: the interaction
   * form cannot upload yet, because the interaction it must be linked to does
   * not exist until Save. Holding the recording in the parent's form state lets
   * it be uploaded after the interaction is confirmed — and kept for a retry if
   * that upload fails.
   */
  onRecordingReady?: (recording: InteractionRecording | null) => void;
  draft?: VoiceDraft | null;
  onDraftChange?: (draft: VoiceDraft | null) => void;
  rewriteContext?: FixtureContext;
  aiMode?: "structured-summary" | "report-rewrite";
  /** Hide raw transcript/legacy summary replace actions where required. */
  allowReplace?: boolean;
  /**
   * Push the transcript into the parent field as soon as it arrives, instead of
   * holding it here until the reviewed checkbox and the apply/confirm steps are
   * completed.
   *
   * The multi-step gate suits the Match Report, where a transcript is rewritten
   * before it becomes the report's comments. It is wrong for the interaction
   * form: there, an unapplied transcript leaves Notes empty, so the save is
   * silently blocked and the spoken note is lost. The text still lands in an
   * editable field, so nothing is applied without the user being able to see and
   * change it.
   */
  autoApply?: boolean;
  className?: string;
}

type Phase = "idle" | "preparing" | "uploading" | "transcribing";

export function VoiceNoteField({
  onTranscribed,
  onAudioAttach,
  onRecordingReady,
  draft,
  onDraftChange,
  rewriteContext,
  aiMode = "structured-summary",
  allowReplace = true,
  autoApply = false,
  className,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(draft?.transcript ?? null);
  const [tokens, setTokens] = useState<Array<{ token: string; confidence: number }>>(
    draft?.tokens ?? [],
  );
  const [avgConfidence, setAvgConfidence] = useState<number | null>(draft?.avgConfidence ?? null);
  const [reviewed, setReviewed] = useState<boolean>(draft?.reviewed ?? false);
  const [rewrite, setRewrite] = useState<string | null>(draft?.rewrite ?? null);
  const [original, setOriginal] = useState<TranscriptVersion | null>(draft?.original ?? null);
  const [versions, setVersions] = useState<TranscriptVersion[]>(draft?.versions ?? []);
  const [showHistory, setShowHistory] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [attemptLog, setAttemptLog] = useState<AttemptLogEntry[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [retryAvailableAt, setRetryAvailableAt] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [restoredFromDraft, setRestoredFromDraft] = useState<boolean>(!!draft?.transcript);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>("audio/webm");
  const fileNameRef = useRef<string>("voice-note.webm");
  const durationRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  // Always call the newest callback: `rec.onstop` closes over the render that
  // started the recording, which can be many renders ago.
  const onRecordingReadyRef = useRef(onRecordingReady);
  onRecordingReadyRef.current = onRecordingReady;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rewriteRequestGateRef = useRef(new LatestRequestGate());
  const summaryRequestGateRef = useRef(new LatestRequestGate());
  const preTranscribeSnapshotRef = useRef<VoiceDraft | null>(null);
  const cancelledPhaseRef = useRef<Phase>("idle");
  const cancelledElapsedRef = useRef<number>(0);
  const [attached, setAttached] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [editValue, setEditValue] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const run = useServerFn(transcribeVoiceNote);
  const runRewrite = useServerFn(rewriteTranscript);
  const runSummarize = useServerFn(summarizeTranscript);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StructuredSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const invalidateAiRequests = () => {
    rewriteRequestGateRef.current.invalidate();
    summaryRequestGateRef.current.invalidate();
    setRewriting(false);
    setSummarizing(false);
  };

  const requestRewrite = async (sourceText = transcript) => {
    if (!sourceText || sourceText.trim().length < 20) {
      toast.error("Transcript is too short to rewrite.");
      return;
    }
    const requestToken = rewriteRequestGateRef.current.begin();
    setRewriting(true);
    setRewriteError(null);
    try {
      const res = await runRewrite({
        data: { transcript: sourceText, context: rewriteContext ?? {} },
      });
      if (!requestToken.isCurrent()) return;
      if (!res.ok) {
        setRewriteError(res.error);
        toast.error(res.error);
        return;
      }
      setRewrite(res.rewrite);
    } catch (err) {
      if (!requestToken.isCurrent()) return;
      const msg = err instanceof Error ? err.message : "Failed to rewrite transcript.";
      setRewriteError(msg);
      toast.error(msg);
    } finally {
      if (requestToken.isCurrent()) setRewriting(false);
    }
  };

  const useRewrite = () => {
    if (!rewrite?.trim()) return;
    const applied = onTranscribed(rewrite, "replace");
    if (applied === false) return;
    toast.success("AI rewrite placed in Comments — review it before submitting");
  };

  const formatSummary = (value: StructuredSummary): string => {
    const parts: string[] = [];
    if (value.headline) parts.push(value.headline);
    if (value.strengths.length) {
      parts.push(`Strengths:\n${value.strengths.map((item) => `• ${item}`).join("\n")}`);
    }
    if (value.improvements.length) {
      parts.push(`Areas to develop:\n${value.improvements.map((item) => `• ${item}`).join("\n")}`);
    }
    if (value.keyMoments.length) {
      parts.push(`Key moments:\n${value.keyMoments.map((item) => `• ${item}`).join("\n")}`);
    }
    return parts.join("\n\n");
  };

  const requestSummary = async () => {
    if (!transcript || transcript.trim().length < 20) {
      toast.error("Transcript is too short to summarise.");
      return;
    }
    const requestToken = summaryRequestGateRef.current.begin();
    setSummarizing(true);
    setSummaryError(null);
    try {
      const result = await runSummarize({ data: { transcript } });
      if (!requestToken.isCurrent()) return;
      if (!result.ok) {
        setSummaryError(result.error);
        toast.error(result.error);
        return;
      }
      setSummary(result.summary);
    } catch (error) {
      if (!requestToken.isCurrent()) return;
      const message = error instanceof Error ? error.message : "Failed to summarise transcript.";
      setSummaryError(message);
      toast.error(message);
    } finally {
      if (requestToken.isCurrent()) setSummarizing(false);
    }
  };

  const insertSummary = (mode: "append" | "replace") => {
    if (!summary) return;
    onTranscribed(formatSummary(summary), mode);
    toast.success(
      mode === "replace" ? "Comments replaced with summary" : "Summary appended to comments",
    );
  };

  const updateSummaryField = <K extends keyof StructuredSummary>(
    key: K,
    value: StructuredSummary[K],
  ) => {
    setSummary((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateSummaryLines = (key: "strengths" | "improvements" | "keyMoments", text: string) => {
    const lines = text
      .split("\n")
      .map((line) => line.replace(/^[\s•\-*]+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    updateSummaryField(key, lines);
  };
  const busy = phase !== "idle";

  const clearPhaseTimer = () => {
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  };

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      cleanupStream();
      clearPhaseTimer();
      abortRef.current?.abort();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  // Sync transcript/review state up into the parent draft so it persists across reloads.
  useEffect(() => {
    if (!onDraftChange) return;
    if (transcript == null) onDraftChange(null);
    else
      onDraftChange({ transcript, tokens, avgConfidence, reviewed, rewrite, original, versions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, tokens, avgConfidence, reviewed, rewrite, original, versions]);

  // Debounced edit versioning: 3s after the last edit, snapshot the current transcript
  // as a new version if it differs from the most recent recorded version and from the original.
  useEffect(() => {
    if (transcript == null || !original) return;
    const latest = versions.length > 0 ? versions[versions.length - 1].text : original.text;
    if (transcript === latest) return;
    const t = setTimeout(() => {
      setVersions((prev) => {
        const lastText = prev.length > 0 ? prev[prev.length - 1].text : original.text;
        if (transcript === lastText) return prev;
        const next: TranscriptVersion = {
          at: new Date().toISOString(),
          text: transcript,
          source: "edit",
          label: "Auto-saved edit",
        };
        // Cap at 20 to keep localStorage payload sensible.
        return [...prev, next].slice(-20);
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [transcript, original, versions]);

  // Tick every 500ms while a retry cooldown is active so the countdown updates.
  useEffect(() => {
    if (!cancelled) return;
    const remaining = retryAvailableAt - Date.now();
    if (remaining <= 0) return;
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [cancelled, retryAvailableAt, nowTick]);

  // Cooldown scales with the number of prior attempts to avoid hammering the transcription API.
  const cooldownMsForAttempts = (attempts: number): number => {
    if (attempts <= 1) return 0;
    if (attempts === 2) return 3000;
    if (attempts === 3) return 8000;
    if (attempts === 4) return 15000;
    return 30000;
  };

  const cooldownRemainingMs = Math.max(0, retryAvailableAt - nowTick);
  const cooldownRemainingSec = Math.ceil(cooldownRemainingMs / 1000);
  const cooldownActive = cooldownRemainingMs > 0;

  const reset = () => {
    abortRef.current?.abort();
    invalidateAiRequests();
    clearPhaseTimer();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setTranscript(null);
    setTokens([]);
    setAvgConfidence(null);
    setReviewed(false);
    setRewrite(null);
    setRewriteError(null);
    setSummary(null);
    setSummaryError(null);
    setOriginal(null);
    setVersions([]);
    setShowHistory(false);
    setErrorMsg(null);
    setPhase("idle");
    setPhaseElapsed(0);
    setAttempt(0);
    setAttemptLog([]);
    setCancelled(false);
    setSkipped(false);
    setRetryAvailableAt(0);
    blobRef.current = null;
    fileNameRef.current = "voice-note.webm";
    durationRef.current = 0;
    onRecordingReadyRef.current?.(null);
    setAttached(false);
    setElapsed(0);
    setRestoredFromDraft(false);
  };

  const enterPhase = (p: Exclude<Phase, "idle">) => {
    clearPhaseTimer();
    setPhase(p);
    setPhaseElapsed(0);
    phaseTimerRef.current = setInterval(() => setPhaseElapsed((s) => s + 1), 1000);
  };

  const logAttempt = (status: AttemptLogEntry["status"], message?: string) => {
    setAttemptLog((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        status,
        message,
      },
    ]);
  };

  const transcribe = async () => {
    const audioBlob = blobRef.current;
    if (!audioBlob) {
      setErrorMsg(TRANSCRIPTION_FAILURE_MESSAGE);
      logAttempt("error", TRANSCRIPTION_FAILURE_MESSAGE);
      return;
    }
    invalidateAiRequests();
    // Snapshot the current transcript state so a subsequent cancel can be undone.
    preTranscribeSnapshotRef.current = transcript
      ? { transcript, tokens, avgConfidence, reviewed, rewrite }
      : null;
    setErrorMsg(null);
    setReviewed(false);
    setTranscript(null);
    setTokens([]);
    setAvgConfidence(null);
    setRewrite(null);
    setRewriteError(null);
    setSummary(null);
    setSummaryError(null);
    setCancelled(false);
    setSkipped(false);
    logAttempt("started");
    const controller = new AbortController();
    abortRef.current = controller;
    enterPhase("uploading");
    // Optimistically flip to "transcribing" once upload buffering finishes (~1.2s).
    const flipTimer = setTimeout(() => {
      if (!controller.signal.aborted) enterPhase("transcribing");
    }, 1200);
    try {
      const audioBase64 = await blobToBase64(audioBlob);
      if (controller.signal.aborted) return;
      const call = run({
        data: { audioBase64, mimeType: mimeRef.current, fileName: fileNameRef.current },
      });
      const result = await new Promise<Awaited<typeof call>>((resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
        call.then(resolve, reject);
      });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setErrorMsg(TRANSCRIPTION_FAILURE_MESSAGE);
        logAttempt("error", TRANSCRIPTION_FAILURE_MESSAGE);
      } else {
        setTranscript(result.text);
        setTokens(result.tokens ?? []);
        setAvgConfidence(result.avgConfidence ?? null);
        setOriginal({
          at: new Date().toISOString(),
          text: result.text,
          source: "ai",
          label: "AI original",
        });
        setVersions([]);
        logAttempt("success");
        if (autoApply) {
          // Straight into the parent field, where it is visible, editable and
          // will actually be submitted. Holding it here is what caused spoken
          // notes to be lost.
          onTranscribed(result.text, "append");
          toast.success("Voice note added to Notes — edit it there if needed");
        } else {
          toast.success("Voice note transcribed — review before applying");
        }
        if (aiMode === "report-rewrite") void requestRewrite(result.text);
      }
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") {
        // Silent — user-initiated cancel.
        return;
      }
      setErrorMsg(TRANSCRIPTION_FAILURE_MESSAGE);
      logAttempt("error", TRANSCRIPTION_FAILURE_MESSAGE);
    } finally {
      clearTimeout(flipTimer);
      clearPhaseTimer();
      if (abortRef.current === controller) abortRef.current = null;
      setPhase("idle");
    }
  };

  const cancelTranscription = () => {
    cancelledPhaseRef.current = phase;
    cancelledElapsedRef.current = phaseElapsed;
    abortRef.current?.abort();
    abortRef.current = null;
    clearPhaseTimer();
    setPhase("idle");
    setErrorMsg(null);
    setCancelled(true);
    // Start a cooldown that scales with the number of transcription attempts so far.
    const cooldownMs = cooldownMsForAttempts(attempt);
    const readyAt = Date.now() + cooldownMs;
    setRetryAvailableAt(readyAt);
    setNowTick(Date.now());
    toast.message("Transcription cancelled", {
      action: { label: "Undo", onClick: () => undoCancel() },
    });
  };

  const undoCancel = () => {
    const snap = preTranscribeSnapshotRef.current;
    setCancelled(false);
    if (snap) {
      // Restore the prior reviewed transcript exactly as it was.
      setTranscript(snap.transcript);
      setTokens(snap.tokens);
      setAvgConfidence(snap.avgConfidence);
      setReviewed(snap.reviewed);
      setRewrite(snap.rewrite ?? null);
      logAttempt("error", "Cancellation undone — restored previous transcript");
      toast.success("Restored previous transcript");
      return;
    }
    // No prior transcript to restore — resume by re-running transcription on the saved audio.
    if (!blobRef.current) {
      toast.error("No saved audio to resume from");
      return;
    }
    logAttempt("error", "Cancellation undone — resuming transcription");
    toast.message("Resuming transcription…");
    setAttempt((a) => a + 1);
    void transcribe();
  };

  const start = async () => {
    reset();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      toast.error("Microphone access is needed to record.");
      return;
    }
    streamRef.current = stream;
    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      cleanupStream();
      toast.error("Recording is not supported in this browser.");
      return;
    }
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const type = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      cleanupStream();
      setRecording(false);
      // Very small threshold: an instant tap-tap on mobile produces a header-only blob.
      // Anything larger, keep — user can still tap Transcribe or Save.
      if (blob.size < 512) {
        toast.error("That recording was too short — please hold to record for at least a second.");
        onRecordingReadyRef.current?.(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      blobRef.current = blob;
      mimeRef.current = type;
      fileNameRef.current = deriveAudioFileName(type);
      durationRef.current = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      onRecordingReadyRef.current?.({ blob, mimeType: type, durationSec: durationRef.current });
      // Do NOT auto-transcribe. Show explicit Transcribe / Save without transcript
      // buttons so mobile users always see an actionable next step.
    };
    startedAtRef.current = Date.now();
    rec.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) {
          try {
            rec.stop();
          } catch {
            /* noop */
          }
        }
        return next;
      });
    }, 1000);
  };

  const stop = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* noop */
    }
  };

  const retry = () => {
    if (!blobRef.current) return;
    setAttempt((n) => n + 1);
    void transcribe();
  };

  const attachAudio = async () => {
    if (!onAudioAttach || attached || attaching) return;
    if (!blobRef.current) return;
    setAttaching(true);
    try {
      await onAudioAttach({
        blob: blobRef.current,
        mimeType: mimeRef.current,
        durationSec: durationRef.current,
      });
      setAttached(true);
    } catch {
      toast.error(
        "Could not save audio to Media Library. Your recording is still available — please try again.",
      );
    } finally {
      setAttaching(false);
    }
  };

  const saveWithoutTranscript = async () => {
    // Abort any in-flight transcription but keep the audio.
    abortRef.current?.abort();
    invalidateAiRequests();
    abortRef.current = null;
    clearPhaseTimer();
    setPhase("idle");
    setErrorMsg(null);
    setCancelled(false);
    // Clear any partial transcript so Comments isn't nudged toward stale text.
    setTranscript(null);
    setTokens([]);
    setAvgConfidence(null);
    setReviewed(false);
    setRewrite(null);
    setRewriteError(null);
    setSummary(null);
    setSummaryError(null);
    setSkipped(true);
    if (onAudioAttach && !attached && blobRef.current) {
      await attachAudio();
    }
    toast.success("Audio saved — type your notes in Comments below");
  };

  const [isEditingText, setIsEditingText] = useState(false);
  const [pendingApply, setPendingApply] = useState<null | "append" | "replace">(null);

  const requestApply = (mode: "append" | "replace") => {
    if (!reviewed) {
      toast.error("Review the transcript first — tick 'I've reviewed this' below.");
      return;
    }
    if (isEditingText) {
      toast.error("Finish editing the transcript first — click outside the editor to continue.");
      return;
    }
    if (!transcript || !transcript.trim()) return;
    setPendingApply(mode);
  };

  const confirmApply = () => {
    if (!pendingApply) return;
    const text = transcript ?? "";
    // Snapshot the exact text at save-time as an immutable "saved" version.
    setVersions((prev) => {
      const lastText = prev.length > 0 ? prev[prev.length - 1].text : (original?.text ?? "");
      const entry: TranscriptVersion = {
        at: new Date().toISOString(),
        text,
        source: "saved",
        label: pendingApply === "append" ? "Saved (append)" : "Saved (replace)",
      };
      if (text === lastText) {
        // Same text — still record the save event so history reflects the action.
        return [...prev, entry].slice(-20);
      }
      return [...prev, entry].slice(-20);
    });
    onTranscribed(text, pendingApply);
    void attachAudio();
    setPendingApply(null);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  // Confidence bucket for a token: high (≥0.85), medium (0.6–0.85), low (<0.6)
  const bucketOf = (c: number): "high" | "med" | "low" =>
    c >= 0.85 ? "high" : c >= 0.6 ? "med" : "low";
  const bucketClass = (b: "high" | "med" | "low") =>
    b === "low"
      ? "bg-destructive/25 text-destructive-foreground underline decoration-destructive decoration-wavy underline-offset-2"
      : b === "med"
        ? "bg-amber-500/25 text-foreground"
        : "";
  const lowCount = tokens.filter((t) => bucketOf(t.confidence) === "low").length;
  const medCount = tokens.filter((t) => bucketOf(t.confidence) === "med").length;
  const overallLabel =
    avgConfidence == null
      ? null
      : avgConfidence >= 0.85
        ? "High"
        : avgConfidence >= 0.6
          ? "Medium"
          : "Low";
  const overallClass =
    avgConfidence == null
      ? ""
      : avgConfidence >= 0.85
        ? "text-gk-green border-gk-green/40"
        : avgConfidence >= 0.6
          ? "text-amber-500 border-amber-500/40"
          : "text-destructive border-destructive/40";

  // Approximate word/sentence timestamps by distributing across the recorded duration,
  // weighted by character length. The transcription model doesn't return timestamps,
  // so this gives a "close enough" jump point for playback navigation.
  const totalDuration = durationRef.current || (audioRef.current?.duration ?? 0) || elapsed || 0;
  type TimedSentence = { text: string; start: number; end: number };
  const timedSentences: TimedSentence[] = (() => {
    if (!transcript || totalDuration <= 0) return [];
    // Split into sentences, keep terminal punctuation.
    const parts = transcript
      .match(/[^.!?\n]+[.!?]?[\s]*/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [transcript];
    const weights = parts.map((p) => Math.max(1, p.replace(/\s+/g, " ").length));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    return parts.map((text, i) => {
      const start = (acc / total) * totalDuration;
      acc += weights[i];
      const end = (acc / total) * totalDuration;
      return { text, start, end };
    });
  })();
  const fmtTs = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };
  const seekTo = (s: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(s, el.duration || s));
    void el.play().catch(() => {});
  };

  return (
    <div
      className={`rounded-md border border-dashed border-border bg-accent/10 p-3 space-y-3 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Voice Note → Comments
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Record a spoken match note — AI transcribes it into text you can drop into the comments
            field. Up to {MAX_SECONDS / 60} minutes.
          </p>
        </div>
        {(audioUrl || transcript) && !recording && (
          <button
            type="button"
            onClick={reset}
            className="size-7 grid place-items-center rounded-md hover:bg-accent text-muted-foreground"
            aria-label="Reset"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {!audioUrl && !recording && !busy && !transcript && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
          >
            <Mic className="size-3.5" />
            Record voice note
          </button>
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-70 animate-ping" />
              <span className="relative inline-flex rounded-full size-2 bg-destructive" />
            </span>
            Recording
          </span>
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {mm}:{ss}
          </span>
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-accent"
          >
            <Square className="size-3.5" />
            Stop
          </button>
        </div>
      )}

      {(audioUrl || transcript) && (
        <div className="flex flex-col gap-2">
          {audioUrl ? (
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              className="w-full h-8"
              onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
            />
          ) : restoredFromDraft ? (
            <div className="text-[11px] text-muted-foreground italic border border-dashed border-border rounded-md p-2">
              Transcript restored from your saved draft. The original audio isn't kept in the draft
              — re-record to update it.
            </div>
          ) : null}
          {busy ? (
            <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span className="font-medium text-foreground">
                    {phase === "preparing" && "Preparing audio…"}
                    {phase === "uploading" && "Uploading to AI…"}
                    {phase === "transcribing" && "Transcribing speech…"}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {phaseElapsed}s
                  </span>
                  {attempt > 1 && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Attempt {attempt}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {onAudioAttach && (
                    <button
                      type="button"
                      onClick={() => void saveWithoutTranscript()}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                    >
                      Save without transcript
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={cancelTranscription}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                  >
                    <X className="size-3" />
                    Cancel
                  </button>
                </div>
              </div>
              <div className="flex gap-1" aria-hidden>
                {(["preparing", "uploading", "transcribing"] as const).map((p) => {
                  const order = { preparing: 0, uploading: 1, transcribing: 2 };
                  const active = order[phase as keyof typeof order] >= order[p];
                  return (
                    <div
                      key={p}
                      className={`h-1 flex-1 rounded-full ${active ? "bg-primary" : "bg-border"} ${phase === p ? "animate-pulse" : ""}`}
                    />
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Your recording is preserved — cancel any time to keep the audio and retry later.
              </p>
              {attemptLog.length > 1 && (
                <div className="pt-1 border-t border-border">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                    <History className="size-3" />
                    Previous attempts: {attemptLog.length - 1}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {attemptLog.slice(0, -1).map((entry, i) => (
                      <span
                        key={entry.id}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] ${entry.status === "error" ? "bg-destructive/15 text-destructive" : entry.status === "success" ? "bg-gk-green/15 text-gk-green" : "bg-primary/15 text-primary"}`}
                      >
                        {i + 1}.{" "}
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                        {entry.status === "error" && <AlertTriangle className="size-3" />}
                        {entry.status === "success" && <CheckCircle2 className="size-3" />}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : skipped ? (
            <div className="rounded-md border border-gk-green/40 bg-gk-green/5 p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-3.5 text-gk-green mt-0.5 shrink-0" />
                <div className="text-xs text-foreground">
                  <div className="font-medium">Audio saved without transcript</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {attached
                      ? "The recording is linked to this report. Type your notes directly into Comments below — you can transcribe later if you want."
                      : "The recording is kept in this draft. Type your notes directly into Comments below — you can transcribe later if you want."}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90"
                >
                  <RotateCcw className="size-3" />
                  Transcribe now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(
                      "Discard this voice note and its saved audio? This cannot be undone.",
                    );
                    if (ok) reset();
                  }}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : !transcript && !errorMsg && !cancelled && audioUrl ? (
            <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-3.5 text-gk-green mt-0.5 shrink-0" />
                <div className="text-xs text-foreground">
                  <div className="font-medium">Recording saved ({elapsed}s)</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Choose what to do next — transcribe with AI, save the audio as-is, or discard
                    and re-record.
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAttempt(1);
                    void transcribe();
                  }}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                >
                  <Sparkles className="size-3.5" />
                  Transcribe with AI
                </button>
                {onAudioAttach && (
                  <button
                    type="button"
                    onClick={() => void saveWithoutTranscript()}
                    disabled={attaching}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {attaching ? "Saving…" : "Save without transcript"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(
                      "Discard this voice note recording? This cannot be undone.",
                    );
                    if (ok) reset();
                  }}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-accent"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-3.5 text-destructive mt-0.5 shrink-0" />
                <div className="text-xs text-foreground">
                  <div className="font-medium text-destructive">Transcription failed</div>
                  <div className="text-muted-foreground mt-0.5">{errorMsg}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90"
                >
                  <RotateCcw className="size-3" />
                  Retry transcription
                </button>
                {onAudioAttach && (
                  <button
                    type="button"
                    onClick={() => void saveWithoutTranscript()}
                    disabled={attaching}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {attaching ? "Saving…" : "Save audio without transcript"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                >
                  Discard
                </button>
              </div>
              {attemptLog.length > 0 && (
                <div className="border-t border-destructive/20 pt-2">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    <History className="size-3" />
                    Transcription attempts log
                  </div>
                  <ul className="space-y-1">
                    {attemptLog.map((entry, i) => (
                      <li key={entry.id} className="flex items-start gap-2 text-[11px]">
                        <span className="text-muted-foreground font-mono tabular-nums">
                          {i + 1}.
                        </span>
                        <span className="text-muted-foreground font-mono tabular-nums">
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 px-1 rounded-sm ${entry.status === "success" ? "bg-gk-green/20 text-gk-green" : entry.status === "error" ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}
                        >
                          {entry.status === "success" && <CheckCircle2 className="size-3" />}
                          {entry.status === "error" && <AlertTriangle className="size-3" />}
                          {entry.status === "started" && (
                            <Loader2 className="size-3 animate-spin" />
                          )}
                          {entry.status === "success"
                            ? "Success"
                            : entry.status === "error"
                              ? "Failed"
                              : "Started"}
                        </span>
                        {entry.message && (
                          <span
                            className="text-muted-foreground truncate max-w-[180px]"
                            title={entry.message}
                          >
                            {entry.message}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : cancelled ? (
            (() => {
              const hasSnapshot = !!preTranscribeSnapshotRef.current;
              const undoNeedsNetwork = !hasSnapshot;
              const cooldownPct =
                cooldownActive && retryAvailableAt > 0
                  ? Math.min(
                      100,
                      Math.max(
                        0,
                        100 - (cooldownRemainingMs / cooldownMsForAttempts(attempt || 1)) * 100,
                      ),
                    )
                  : 100;
              const undoDisabled = undoNeedsNetwork && cooldownActive;
              const retryDisabled = cooldownActive;
              return (
                <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
                  <div className="flex items-start gap-2">
                    <XCircle className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-foreground">
                      <div className="font-medium">Transcription cancelled</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {cancelledPhaseRef.current !== "idle" && (
                          <>
                            Stopped during{" "}
                            <span className="font-mono uppercase tracking-wider">
                              {cancelledPhaseRef.current}
                            </span>
                            {cancelledElapsedRef.current
                              ? ` at ${cancelledElapsedRef.current}s`
                              : ""}
                            .{" "}
                          </>
                        )}
                        The audio recording is still saved.
                        {hasSnapshot
                          ? " Undo to restore your previous transcript, retry, or save without a transcript."
                          : " Undo to resume, retry, or save without a transcript."}
                      </div>
                    </div>
                  </div>
                  {cooldownActive && (
                    <div className="rounded-md border border-border/60 bg-muted/40 p-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                        <span className="text-muted-foreground">Retry cooldown</span>
                        <span className="text-foreground">
                          Available in {cooldownRemainingSec}s
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full bg-primary transition-[width] duration-500 ease-linear"
                          style={{ width: `${cooldownPct}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Backing off after {attempt} attempt{attempt === 1 ? "" : "s"} to protect the
                        transcription service.{" "}
                        {hasSnapshot
                          ? "Undo cancellation is available now — it just restores your prior transcript."
                          : "You can still save the audio without a transcript while you wait."}
                      </div>
                    </div>
                  )}
                  {!cooldownActive && attempt >= 1 && (
                    <div className="text-[10px] font-mono uppercase tracking-wider text-gk-green">
                      Retry available now
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={undoCancel}
                      disabled={undoDisabled}
                      title={
                        undoDisabled
                          ? `Resuming needs the network — available in ${cooldownRemainingSec}s`
                          : undefined
                      }
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="size-3" />
                      Undo cancellation{undoDisabled ? ` (${cooldownRemainingSec}s)` : ""}
                    </button>
                    <button
                      type="button"
                      onClick={retry}
                      disabled={retryDisabled}
                      title={
                        retryDisabled
                          ? `Retry cools down for ${cooldownRemainingSec}s more`
                          : undefined
                      }
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Retry from scratch{retryDisabled ? ` (${cooldownRemainingSec}s)` : ""}
                    </button>
                    {onAudioAttach && (
                      <button
                        type="button"
                        onClick={() => void saveWithoutTranscript()}
                        disabled={attaching}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent disabled:opacity-50"
                      >
                        {attaching ? "Saving…" : "Save audio without transcript"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm(
                          "Discard this voice note and its saved audio? This cannot be undone.",
                        );
                        if (ok) reset();
                      }}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              );
            })()
          ) : transcript ? (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Transcript preview — edit before applying
                </div>
                <div className="flex items-center gap-1.5">
                  {overallLabel && (
                    <span
                      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider ${overallClass}`}
                    >
                      {overallLabel} confidence · {Math.round((avgConfidence ?? 0) * 100)}%
                    </span>
                  )}
                  {tokens.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditing((v) => !v)}
                      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-accent"
                    >
                      {editing ? "Hide confidence view" : "Show confidence view"}
                    </button>
                  )}
                  {audioUrl && timedSentences.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTimestamps((v) => !v)}
                      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-accent"
                      aria-pressed={showTimestamps}
                    >
                      {showTimestamps ? "Hide timestamps" : "Show timestamps"}
                    </button>
                  )}
                  {(original || versions.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setShowHistory((v) => !v)}
                      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-accent"
                      aria-pressed={showHistory}
                    >
                      {showHistory ? "Hide history" : `History (${1 + versions.length})`}
                    </button>
                  )}
                </div>
              </div>
              {showHistory && (original || versions.length > 0) && (
                <div
                  className="bg-muted/40 border border-border rounded-md p-2 max-h-56 overflow-y-auto space-y-1.5"
                  aria-label="Transcript version history"
                >
                  <div className="text-[10px] text-muted-foreground">
                    The AI original is preserved. Each auto-saved edit and save is timestamped.
                    Reverting replaces the current text and records a new version.
                  </div>
                  {[...(original ? [original] : []), ...versions].map((v, i, arr) => {
                    const isCurrent = i === arr.length - 1 && transcript === v.text;
                    const badgeClass =
                      v.source === "ai"
                        ? "bg-primary/15 text-primary border-primary/30"
                        : v.source === "saved"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-amber-500/15 text-foreground border-amber-500/30";
                    return (
                      <div
                        key={`${v.at}-${i}`}
                        className="rounded-sm border border-border bg-background p-1.5 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center h-4 px-1 rounded-sm border text-[9px] font-mono uppercase tracking-wider ${badgeClass}`}
                            >
                              {v.label ?? v.source}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                              {new Date(v.at).toLocaleString()}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                current
                              </span>
                            )}
                          </div>
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => {
                                const now = new Date().toISOString();
                                setVersions((prev) =>
                                  [
                                    ...prev,
                                    {
                                      at: now,
                                      text: v.text,
                                      source: "edit" as const,
                                      label: `Reverted to ${v.label ?? v.source}`,
                                    },
                                  ].slice(-20),
                                );
                                invalidateAiRequests();
                                setTranscript(v.text);
                                setTokens([]);
                                setAvgConfidence(null);
                                setReviewed(false);
                                toast.success("Reverted to earlier version");
                              }}
                              className="inline-flex items-center h-5 px-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-accent"
                            >
                              Revert
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-foreground/90">
                          {v.text.length > 200 ? `${v.text.slice(0, 200)}…` : v.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {showTimestamps && audioUrl && timedSentences.length > 0 && (
                <div className="bg-muted/40 border border-border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                  <div className="text-[10px] text-muted-foreground mb-1">
                    Approximate timings — click a sentence to jump the audio to that point.
                  </div>
                  {timedSentences.map((s, i) => {
                    const active = currentTime >= s.start && currentTime < s.end;
                    return (
                      <button
                        type="button"
                        key={i}
                        onClick={() => seekTo(s.start)}
                        className={`w-full text-left flex gap-2 items-start text-xs rounded-sm px-1.5 py-1 hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-primary ${active ? "bg-primary/10 border-l-2 border-primary" : ""}`}
                        aria-label={`Jump to ${fmtTs(s.start)}: ${s.text}`}
                      >
                        <span className="font-mono tabular-nums text-[10px] text-primary shrink-0 mt-0.5">
                          {fmtTs(s.start)}
                        </span>
                        <span className="text-foreground leading-relaxed">{s.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {editing && tokens.length > 0 && (
                <div className="text-xs whitespace-pre-wrap bg-muted/40 border border-border rounded-md p-2 max-h-32 overflow-y-auto leading-relaxed">
                  {tokens.map((t, i) => {
                    const b = bucketOf(t.confidence);
                    const cls = bucketClass(b);
                    return (
                      <span
                        key={i}
                        className={cls ? `rounded-sm px-[1px] ${cls}` : undefined}
                        title={`Confidence ${(t.confidence * 100).toFixed(0)}%`}
                      >
                        {t.token}
                      </span>
                    );
                  })}
                </div>
              )}
              <textarea
                value={transcript}
                onChange={(e) => {
                  invalidateAiRequests();
                  setTranscript(e.target.value);
                  setRewrite(null);
                  setRewriteError(null);
                  setSummary(null);
                  setSummaryError(null);
                  if (tokens.length > 0) {
                    setTokens([]);
                    setAvgConfidence(null);
                  }
                  setReviewed(false);
                  if (pendingApply) setPendingApply(null);
                }}
                onFocus={() => setIsEditingText(true)}
                onBlur={() => setIsEditingText(false)}
                rows={6}
                className="w-full text-xs bg-background border border-border rounded-md p-2 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Edit the transcript before saving…"
                aria-label="Editable transcript preview"
              />
              {tokens.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-2 rounded-sm bg-amber-500/50" />
                    Medium ({medCount})
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-2 rounded-sm bg-destructive/50" />
                    Low ({lowCount})
                  </span>
                  <span className="opacity-70">Editing the text clears highlights.</span>
                </div>
              )}
              <label className="inline-flex items-center gap-1.5 text-[11px] text-foreground select-none">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={isEditingText}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                I've reviewed the transcript
              </label>
              {isEditingText && (
                <div className="text-[11px] text-amber-500" role="status">
                  You're editing the transcript — click outside the editor to enable saving.
                </div>
              )}
              {pendingApply ? (
                <div
                  className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2"
                  role="alertdialog"
                  aria-label="Confirm save transcript"
                >
                  <div className="text-[11px] font-medium text-foreground">
                    Save transcript (
                    {pendingApply === "append" ? "append to comments" : "replace comments"})?
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {transcript.trim().length} characters ·{" "}
                    {transcript.trim().split(/\s+/).filter(Boolean).length} words. This cannot be
                    undone from here.
                  </div>
                  <div className="text-[11px] bg-background border border-border rounded-sm p-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                    {transcript.length > 240 ? `${transcript.slice(0, 240)}…` : transcript}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={confirmApply}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90"
                    >
                      Confirm save
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingApply(null)}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                    >
                      Keep editing
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={!reviewed || !transcript.trim() || isEditingText}
                    onClick={() => requestApply("append")}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Append to comments
                  </button>
                  {allowReplace && (
                    <button
                      type="button"
                      disabled={!reviewed || !transcript.trim() || isEditingText}
                      onClick={() => requestApply("replace")}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Replace comments
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(transcript);
                      toast.success("Copied");
                    }}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                  >
                    <RotateCcw className="size-3" />
                    Retry
                  </button>
                  {aiMode === "report-rewrite" ? (
                    <button
                      type="button"
                      disabled={rewriting || !transcript || transcript.trim().length < 20}
                      onClick={() => void requestRewrite()}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-primary/40 text-primary text-[11px] font-medium hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Create a faithful, polished rewrite using the selected fixture details"
                    >
                      {rewriting ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      {rewrite ? "Regenerate AI rewrite" : "Generate AI rewrite"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={summarizing || !transcript || transcript.trim().length < 20}
                      onClick={() => void requestSummary()}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-primary/40 text-primary text-[11px] font-medium hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Use AI to draft a structured summary from this transcript"
                    >
                      {summarizing ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      {summary ? "Regenerate summary" : "Suggest summary"}
                    </button>
                  )}
                </div>
              )}

              {aiMode === "report-rewrite" && rewriting && !rewrite && (
                <div
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  role="status"
                >
                  <Loader2 className="size-3 animate-spin" />
                  Preparing an editable AI rewrite…
                </div>
              )}

              {aiMode === "report-rewrite" && rewriteError && !rewrite && (
                <div className="text-[11px] text-destructive" role="alert">
                  {rewriteError}
                </div>
              )}

              {aiMode === "report-rewrite" && rewrite && (
                <div
                  className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2"
                  aria-label="AI-suggested report rewrite"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary inline-flex items-center gap-1">
                      <Sparkles className="size-3" /> AI rewrite — review before using
                    </div>
                    <button
                      type="button"
                      onClick={() => setRewrite(null)}
                      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-accent"
                    >
                      Dismiss
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    This keeps the mentor's observations but cleans up speech and uses the selected
                    goalkeeper and fixture names. Edit anything before inserting.
                  </p>
                  <textarea
                    value={rewrite}
                    onChange={(e) => setRewrite(e.target.value)}
                    rows={8}
                    className="w-full text-xs bg-background border border-border rounded-md p-2 leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Editable AI rewrite"
                    aria-label="Editable AI rewrite"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={useRewrite}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90"
                    >
                      Use AI rewrite
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(rewrite);
                        toast.success("AI rewrite copied");
                      }}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {aiMode === "structured-summary" && summaryError && !summary && (
                <div className="text-[11px] text-destructive" role="alert">
                  {summaryError}
                </div>
              )}

              {aiMode === "structured-summary" && summary && (
                <div
                  className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2"
                  aria-label="AI-suggested structured summary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary inline-flex items-center gap-1">
                      <Sparkles className="size-3" /> AI suggestion — review before inserting
                    </div>
                    <button
                      type="button"
                      onClick={() => setSummary(null)}
                      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-border text-[10px] font-medium hover:bg-accent"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                      Headline
                    </label>
                    <input
                      type="text"
                      value={summary.headline}
                      onChange={(event) => updateSummaryField("headline", event.target.value)}
                      className="w-full text-xs bg-background border border-border rounded-md p-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="One-sentence headline"
                    />
                  </div>
                  {(["strengths", "improvements", "keyMoments"] as const).map((key) => {
                    const label =
                      key === "strengths"
                        ? "Strengths"
                        : key === "improvements"
                          ? "Areas to develop"
                          : "Key moments";
                    return (
                      <div key={key} className="space-y-1">
                        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                          {label} <span className="opacity-60">· one per line</span>
                        </label>
                        <textarea
                          value={summary[key].join("\n")}
                          onChange={(event) => updateSummaryLines(key, event.target.value)}
                          rows={Math.max(2, Math.min(5, summary[key].length + 1))}
                          className="w-full text-xs bg-background border border-border rounded-md p-1.5 leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder={`Add ${label.toLowerCase()}…`}
                        />
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => insertSummary("append")}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90"
                    >
                      Append to comments
                    </button>
                    {allowReplace && (
                      <button
                        type="button"
                        onClick={() => insertSummary("replace")}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                      >
                        Replace comments
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(formatSummary(summary));
                        toast.success("Summary copied");
                      }}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {onAudioAttach && blobRef.current && (
                <div className="text-[11px] mt-1">
                  {attaching ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Saving audio to Media Library…
                    </span>
                  ) : attached ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="size-3" />
                      Audio saved to Media Library and linked to this report
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={attachAudio}
                      className="underline text-muted-foreground hover:text-foreground"
                    >
                      Save audio to Media Library
                    </button>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
