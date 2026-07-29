import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2, ClipboardList, FileText, Mic, X, Search,
  AlertTriangle, ArrowLeft, Play, Square,
} from "lucide-react";
import { goalkeepers } from "@/lib/mock-data";
import {
  RPM7_METRICS,
  insertMentorInteractionRow,
  insertMatchReportRow,
  selectAssignedPlayers,
  selectPlayer,
  type Rpm7Scores,
  type WellbeingFlag,
} from "@/lib/mentor-domain";
import {
  ALLOWED_INTERACTION_TYPES,
  InvalidInteractionTypeError,
} from "@/lib/mentor-session-store";
import { Avatar } from "@/components/primitives";

// -----------------------------------------------------------------------------
// Types & shared UI
// -----------------------------------------------------------------------------

export type MentorWorkflow = "interaction" | "report" | "voice";

const TITLES: Record<MentorWorkflow, string> = {
  interaction: "Log interaction",
  report: "Match report — not available here",
  voice: "Voice note",
};

const SUBTITLES: Record<MentorWorkflow, string> = {
  interaction: "Under 2 minutes — capture the touchpoint.",
  report: "Match Reports must be submitted through the production form on Reports.",
  voice: "Paste or type a transcript. We'll turn it into an interaction.",
};

const INTERACTION_TYPES: readonly string[] = ALLOWED_INTERACTION_TYPES;

const OUTCOMES = [
  "On track",
  "Above expectation",
  "Below expectation",
  "Needs follow-up",
  "Action plan agreed",
];

const RECOMMENDATIONS = [
  "Continue current programme",
  "Monitor closely",
  "Recommend for pathway",
  "Development gap — action needed",
  "Escalate to head coach",
];

const inputCls =
  "w-full h-10 px-3 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";
const selectCls = inputCls;
const taCls =
  "w-full px-3 py-2 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none";

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dialog shell
// -----------------------------------------------------------------------------

export interface MentorWorkflowState {
  kind: MentorWorkflow;
  playerId?: string;
}

interface DialogProps {
  state: MentorWorkflowState | null;
  mentorProfileId: string;
  onClose: () => void;
}

export function MentorWorkflowDialog({ state, mentorProfileId, onClose }: DialogProps) {
  if (!state) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-background/70 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-card border border-border sm:rounded-lg rounded-t-xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate">{TITLES[state.kind]}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{SUBTITLES[state.kind]}</p>
          </div>
          <button onClick={onClose} className="size-9 shrink-0 grid place-items-center rounded-md hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto">
          {state.kind === "interaction" && (
            <InteractionForm
              mentorProfileId={mentorProfileId}
              playerId={state.playerId}
              onDone={onClose}
            />
          )}
          {state.kind === "report" && (
            <MatchReportRedirect playerId={state.playerId} onDone={onClose} />
          )}
          {state.kind === "voice" && (
            <VoiceNoteForm
              mentorProfileId={mentorProfileId}
              playerId={state.playerId}
              onDone={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Player picker (roster-scoped)
// -----------------------------------------------------------------------------

function PlayerPicker({
  mentorProfileId, value, onChange, required,
}: { mentorProfileId: string; value: string; onChange: (id: string) => void; required?: boolean }) {
  const roster = useMemo(() => selectAssignedPlayers(mentorProfileId), [mentorProfileId]);
  const [q, setQ] = useState("");
  const selected = roster.find((r) => r.id === value);
  const filtered = q
    ? roster.filter((r) => r.full_name.toLowerCase().includes(q.toLowerCase()) || r.club.toLowerCase().includes(q.toLowerCase()))
    : roster;

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
        <Avatar initials={selected.initials} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{selected.full_name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{selected.club} · {selected.league}</div>
        </div>
        <button type="button" onClick={() => onChange("")} className="text-[11px] text-primary hover:underline shrink-0">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your roster…"
          className="w-full h-10 pl-9 pr-3 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          inputMode="search"
          autoFocus={required}
        />
      </div>
      <ul className="max-h-52 overflow-y-auto divide-y divide-border rounded-md border border-border">
        {filtered.slice(0, 25).map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onChange(p.id)}
              className="w-full grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 items-center px-3 py-2 text-left hover:bg-accent/40"
            >
              <Avatar initials={p.initials} size={28} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.full_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{p.club}</div>
              </div>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-xs text-muted-foreground text-center py-4">No matches.</li>
        )}
      </ul>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Success screen
// -----------------------------------------------------------------------------

function Success({
  title, body, playerId, onDone, onAnother,
}: { title: string; body: string; playerId?: string; onDone: () => void; onAnother?: () => void }) {
  const player = playerId ? selectPlayer(playerId) : null;
  return (
    <div className="text-center py-6">
      <div className="mx-auto size-14 grid place-items-center rounded-full bg-primary/15 text-primary">
        <CheckCircle2 className="size-7" />
      </div>
      <h4 className="mt-3 text-base font-semibold">{title}</h4>
      <p className="text-sm text-muted-foreground mt-1">{body}</p>
      {player && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent/30 px-3 py-1.5">
          <Avatar initials={player.initials} size={20} />
          <span className="text-xs font-medium">{player.full_name}</span>
        </div>
      )}
      <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-center">
        {onAnother && (
          <button
            onClick={onAnother}
            className="h-10 px-4 rounded-md border border-border text-sm font-medium"
          >
            Log another
          </button>
        )}
        <button
          onClick={onDone}
          className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Wellbeing traffic-light picker
// -----------------------------------------------------------------------------

function WellbeingPicker({ value, onChange }: { value: WellbeingFlag; onChange: (v: WellbeingFlag) => void }) {
  const opts: Array<{ v: WellbeingFlag; label: string; hint: string; tone: string }> = [
    { v: "green", label: "Green", hint: "Player is well", tone: "border-primary/40 bg-primary/10 text-primary" },
    { v: "amber", label: "Amber", hint: "Some concern", tone: "border-warning/40 bg-warning/10 text-warning" },
    { v: "red", label: "Red", hint: "Escalate today", tone: "border-destructive/40 bg-destructive/10 text-destructive" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`h-16 rounded-md border text-xs font-medium flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? o.tone : "border-border bg-background/40 text-muted-foreground hover:bg-accent/30"
            }`}
          >
            <span className="uppercase tracking-wider text-[10px]">{o.label}</span>
            <span className="text-[10px] font-normal opacity-80">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Interaction form
// -----------------------------------------------------------------------------

interface InteractionFormProps {
  mentorProfileId: string;
  playerId?: string;
  onDone: () => void;
  initialTranscript?: string;
  transcriptSource?: "voice_note" | "typed" | "handwritten";
  onBack?: () => void;
}

function InteractionForm({
  mentorProfileId, playerId, onDone, initialTranscript = "", transcriptSource = "typed", onBack,
}: InteractionFormProps) {
  const [gkId, setGkId] = useState(playerId ?? "");
  const [type, setType] = useState(INTERACTION_TYPES[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState(initialTranscript);
  const [wellbeing, setWellbeing] = useState<WellbeingFlag>("green");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState<{ playerId: string } | null>(null);

  const canSubmit = gkId && summary.trim().length > 0 && (!followUpRequired || nextAction.trim().length > 0);

  if (done && submitted) {
    return (
      <Success
        title="Interaction logged"
        body="Added to your recent activity."
        playerId={submitted.playerId}
        onDone={onDone}
        onAnother={() => {
          setDone(false);
          setSummary("");
          setNextAction("");
          setFollowUpRequired(false);
          setWellbeing("green");
        }}
      />
    );
  }

  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      insertMentorInteractionRow({
        player_id: gkId,
        mentor_profile_id: mentorProfileId,
        interaction_type: type,
        occurred_at: new Date(date).toISOString(),
        notes: summary.trim(),
        outcome,
        follow_up: followUpRequired ? nextAction.trim() : "",
        wellbeing_flag: wellbeing,
        follow_up_required: followUpRequired,
        next_action: followUpRequired ? nextAction.trim() : undefined,
        transcript_source: transcriptSource,
      });
      setSubmitError(null);
      setSubmitted({ playerId: gkId });
      setDone(true);
    } catch (err) {
      if (err instanceof InvalidInteractionTypeError) {
        setSubmitError(err.message);
        return;
      }
      throw err;
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to transcript
        </button>
      )}
      {submitError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {submitError}
        </div>
      )}
      <Field label="Player" required>
        <PlayerPicker mentorProfileId={mentorProfileId} value={gkId} onChange={setGkId} required={!playerId} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Interaction type" required>
          <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
            {INTERACTION_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date" required>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>

      <Field label="Short summary" required hint="One or two sentences — what happened, what stood out.">
        <textarea
          rows={3}
          className={taCls}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Quick recap of the touchpoint…"
          required
        />
      </Field>

      <Field label="Wellbeing flag" required hint="Your read on the player right now.">
        <WellbeingPicker value={wellbeing} onChange={setWellbeing} />
      </Field>

      <Field label="Outcome">
        <select className={selectCls} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
        </select>
      </Field>

      <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={followUpRequired}
            onChange={(e) => setFollowUpRequired(e.target.checked)}
          />
          <span className="text-sm font-medium">Follow-up required</span>
        </label>
        {followUpRequired && (
          <Field label="Next action" required>
            <input
              className={inputCls}
              placeholder="e.g. Schedule video review next Tuesday"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              required
            />
          </Field>
        )}
      </div>

      {wellbeing === "red" && (
        <div className="flex items-start gap-2 text-xs rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>Red wellbeing flag will notify the head of goalkeeping in the production build.</span>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="h-11 sm:h-10 px-4 rounded-md border border-border text-sm">Cancel</button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 sm:h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          Save interaction
        </button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Match report form (7 RPM metrics)
// -----------------------------------------------------------------------------

/**
 * The mock/session Match Report form that used to live here has been REMOVED
 * from the production reporting path.
 *
 * It wrote 1–10 scores straight into `mentor-session-store` and bypassed the
 * server-enforced Coach derivation, structured Comments validation, Competition
 * (column O) and the submission ledger's duplicate protection. There is exactly
 * one real Match Report write path: `ReportForm` in `src/components/workflows.tsx`
 * calling the `submitMatchReport` server function.
 */
function MatchReportRedirect({ playerId, onDone }: { playerId?: string; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        <div className="font-medium">Match Reports are not submitted from here</div>
        <p className="text-muted-foreground mt-1">
          This mentor workspace only holds demo/session interactions. Real Match Reports are
          validated and written to the Match Reports source by the production form.
        </p>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onDone} className="h-11 sm:h-10 px-4 rounded-md border border-border text-sm">
          Cancel
        </button>
        <Link
          to="/reports"
          search={{ openSubmit: "1", gk: playerId ?? "" }}
          onClick={onDone}
          className="h-11 sm:h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center"
        >
          Open the Match Report form
        </Link>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Voice-note form (paste/type transcript, hand off to interaction form)
// -----------------------------------------------------------------------------

function VoiceNoteForm({
  mentorProfileId, playerId, onDone,
}: { mentorProfileId: string; playerId?: string; onDone: () => void }) {
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [handoff, setHandoff] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (recording) {
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [recording]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (handoff) {
    return (
      <InteractionForm
        mentorProfileId={mentorProfileId}
        playerId={playerId}
        onDone={onDone}
        initialTranscript={transcript}
        transcriptSource="voice_note"
        onBack={() => setHandoff(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-background/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {recording ? "Recording…" : "Tap to simulate recording"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Prototype only — audio isn't captured. Paste or type your transcript below.
            </div>
          </div>
          <div className={`tabular-nums font-mono text-lg font-semibold shrink-0 ${recording ? "text-destructive" : "text-muted-foreground"}`}>
            {mm}:{ss}
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setRecording((r) => !r)}
            className={`flex-1 h-11 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 ${
              recording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
            }`}
          >
            {recording ? <><Square className="size-4" /> Stop</> : <><Mic className="size-4" /> Start</>}
          </button>
          {seconds > 0 && !recording && (
            <button
              type="button"
              onClick={() => { setSeconds(0); }}
              className="h-11 px-4 rounded-md border border-border text-sm"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <Field label="Transcript" required hint="Paste from your voice-to-text app, or type it out.">
        <textarea
          rows={7}
          className={taCls}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="e.g. Just came off a call with Alex — he's frustrated with rotation. Wants a one-to-one with the head coach. Follow up Friday…"
        />
      </Field>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="h-11 sm:h-10 px-4 rounded-md border border-border text-sm">Cancel</button>
        <button
          type="button"
          disabled={!transcript.trim()}
          onClick={() => setHandoff(true)}
          className="h-11 sm:h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <ClipboardList className="size-4" /> Continue to interaction
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Convenience export: launcher tile (used by the dashboard quick actions)
// -----------------------------------------------------------------------------

export const MENTOR_WORKFLOW_META: Record<MentorWorkflow, { label: string; icon: typeof Mic }> = {
  interaction: { label: "Log interaction", icon: ClipboardList },
  report: { label: "Match report (opens production form)", icon: FileText },
  voice: { label: "Voice note", icon: Mic },
};

// silence unused-import lint for goalkeepers (kept for future roster fallback)
void goalkeepers;
