/**
 * Manager UI for bulk Excel fixture import onto the shared team calendar.
 *
 * Flow: upload → local parse/preview → resolve goalkeepers → confirm → server
 * commit. Nothing is written until the explicit confirm step.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import type { AssignableMentor, TeamCalendarEvent } from "@/lib/calendar.functions";
import { commitFixtureImport } from "@/lib/calendar/fixture-import.functions";
import {
  parseFixtureCsv,
  parseFixtureWorkbook,
  prepareFixtureImport,
  type FixtureImportCommitResult,
  type FixtureRosterPlayer,
  type ParsedFixtureRow,
  type PreparedFixtureRow,
} from "@/lib/calendar/fixture-import";

interface Props {
  open: boolean;
  onClose: () => void;
  roster: FixtureRosterPlayer[];
  mentors: AssignableMentor[];
  existingEvents: TeamCalendarEvent[];
  onImported: () => Promise<void>;
}

type Step = "upload" | "preview" | "confirm" | "done";

export function FixtureImportDialog({
  open,
  onClose,
  roster,
  mentors,
  existingEvents,
  onImported,
}: Props) {
  const commitImport = useServerFn(commitFixtureImport);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedFixtureRow[]>([]);
  const [defaultStartTime, setDefaultStartTime] = useState("15:00");
  const [defaultMentorId, setDefaultMentorId] = useState("");
  const [goalkeeperResolutions, setGoalkeeperResolutions] = useState<Record<number, string>>({});
  const [timeOverrides, setTimeOverrides] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FixtureImportCommitResult | null>(null);

  const existingRefs = useMemo(
    () =>
      existingEvents.map((event) => ({
        id: event.id,
        player_id: event.player_id,
        event_date: event.event_date,
        start_time: event.start_time,
        title: event.title,
        event_type: event.event_type,
        notes: event.notes,
        location: event.location,
        status: event.status,
      })),
    [existingEvents],
  );

  const prepared = useMemo(() => {
    if (!parsedRows.length) {
      return {
        rows: [] as PreparedFixtureRow[],
        summary: {
          total: 0,
          ready: 0,
          duplicates: 0,
          unmatchedGoalkeepers: 0,
          ambiguousGoalkeepers: 0,
          validationErrors: 0,
        },
      };
    }
    return prepareFixtureImport({
      rows: parsedRows,
      roster,
      existingEvents: existingRefs,
      defaultStartTime,
      goalkeeperResolutions,
      timeOverrides,
    });
  }, [
    parsedRows,
    roster,
    existingRefs,
    defaultStartTime,
    goalkeeperResolutions,
    timeOverrides,
  ]);

  const readyRows = prepared.rows.filter((row) => row.status === "ready");

  function reset() {
    setStep("upload");
    setFileName("");
    setParsedRows([]);
    setDefaultStartTime("15:00");
    setDefaultMentorId("");
    setGoalkeeperResolutions({});
    setTimeOverrides({});
    setBusy(false);
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      toast.error("Upload an Excel (.xlsx) or CSV fixture schedule.");
      return;
    }
    try {
      setBusy(true);
      let rows: ParsedFixtureRow[];
      if (lower.endsWith(".csv")) {
        rows = parseFixtureCsv(await file.text());
      } else {
        rows = parseFixtureWorkbook(await file.arrayBuffer());
      }
      if (!rows.length) {
        toast.error("No fixture rows were found in that file.");
        return;
      }
      setFileName(file.name);
      setParsedRows(rows);
      setGoalkeeperResolutions({});
      setTimeOverrides({});
      setResult(null);
      setStep("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that spreadsheet.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!defaultMentorId) {
      toast.error("Choose the mentor attending these fixtures.");
      return;
    }
    if (!readyRows.length) {
      toast.error("There are no fixtures ready to import.");
      return;
    }
    setBusy(true);
    try {
      const commitResult = await commitImport({
        data: {
          confirm: true as const,
          rows: readyRows.map((row) => ({
            rowNumber: row.rowNumber,
            title: row.title,
            event_date: row.eventDate!,
            start_time: row.startTime!,
            location: row.location,
            notes: row.notes,
            player_id: row.goalkeeper.playerId!,
            assigned_mentor_id: defaultMentorId,
            duplicateKey: row.duplicateKey,
          })),
        },
      });
      setResult(commitResult);
      setStep("done");
      await onImported();
      toast.success(
        `Imported ${commitResult.imported}, skipped ${commitResult.skipped}, failed ${commitResult.failed}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
      <div className="mt-6 w-full max-w-3xl rounded-lg border border-border bg-card p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Import fixtures</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload an Excel schedule, review matches, then confirm before anything is written.
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close import"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "upload" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-10 text-center hover:bg-muted/40">
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">Choose .xlsx or .csv file</span>
              <span className="text-xs text-muted-foreground">
                Expected columns: Date, Time, Goalkeeper, Club, Opponent, Competition, Venue, Home/Away
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                disabled={busy}
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              Each imported row becomes a Match calendar event for one goalkeeper and the mentor you
              assign. Imported Matches create the same 48-hour match-report follow-up as a manually
              added Match.
            </p>
          </div>
        )}

        {(step === "preview" || step === "confirm") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-muted-foreground">
                File: <span className="text-foreground">{fileName}</span> · {prepared.summary.total}{" "}
                rows
              </div>
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 hover:bg-accent"
                onClick={() => {
                  setParsedRows([]);
                  setStep("upload");
                }}
              >
                Choose another file
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Default kick-off (rows without a time)
                </span>
                <input
                  type="time"
                  value={defaultStartTime}
                  onChange={(event) => setDefaultStartTime(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Mentor attending</span>
                <select
                  value={defaultMentorId}
                  onChange={(event) => setDefaultMentorId(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                >
                  <option value="">Choose a mentor…</option>
                  {mentors.map((mentor) => (
                    <option key={mentor.id} value={mentor.id}>
                      {mentor.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <SummaryStrip summary={prepared.summary} readyCount={readyRows.length} />

            <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-md border border-border p-2">
              {prepared.rows.map((row) => (
                <PreviewRow
                  key={row.rowNumber}
                  row={row}
                  roster={roster}
                  selectedPlayerId={goalkeeperResolutions[row.rowNumber] ?? row.goalkeeper.playerId ?? ""}
                  timeOverride={timeOverrides[row.rowNumber] ?? ""}
                  onResolveGoalkeeper={(playerId) =>
                    setGoalkeeperResolutions((prev) => ({ ...prev, [row.rowNumber]: playerId }))
                  }
                  onTimeOverride={(value) =>
                    setTimeOverrides((prev) => ({ ...prev, [row.rowNumber]: value }))
                  }
                />
              ))}
            </div>

            {step === "preview" ? (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!readyRows.length || !defaultMentorId}
                  onClick={() => setStep("confirm")}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  Review {readyRows.length} ready fixture{readyRows.length === 1 ? "" : "s"}
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p>
                  About to create <strong>{readyRows.length}</strong> Match event
                  {readyRows.length === 1 ? "" : "s"} for{" "}
                  {mentors.find((m) => m.id === defaultMentorId)?.name ?? "the selected mentor"}.
                  Duplicates and unresolved rows will not be written.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("preview")}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCommit()}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {busy ? "Importing…" : "Confirm import"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <Stat label="Imported" value={result.imported} />
              <Stat label="Skipped" value={result.skipped} />
              <Stat label="Failed" value={result.failed} />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {result.rows.map((row) => (
                <div key={row.rowNumber} className="flex gap-2 border-b border-border/50 py-1 last:border-0">
                  <span className="w-14 shrink-0 text-muted-foreground">Row {row.rowNumber}</span>
                  <span className="font-medium capitalize">{row.outcome.replace("_", " ")}</span>
                  <span className="text-muted-foreground">{row.message}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStrip({
  summary,
  readyCount,
}: {
  summary: {
    ready: number;
    duplicates: number;
    unmatchedGoalkeepers: number;
    ambiguousGoalkeepers: number;
    validationErrors: number;
  };
  readyCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
      <Stat label="Ready" value={readyCount} />
      <Stat label="Duplicates" value={summary.duplicates} />
      <Stat label="Unmatched GK" value={summary.unmatchedGoalkeepers} />
      <Stat label="Ambiguous GK" value={summary.ambiguousGoalkeepers} />
      <Stat label="Errors" value={summary.validationErrors} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PreviewRow({
  row,
  roster,
  selectedPlayerId,
  timeOverride,
  onResolveGoalkeeper,
  onTimeOverride,
}: {
  row: PreparedFixtureRow;
  roster: FixtureRosterPlayer[];
  selectedPlayerId: string;
  timeOverride: string;
  onResolveGoalkeeper: (playerId: string) => void;
  onTimeOverride: (value: string) => void;
}) {
  const tone =
    row.status === "ready"
      ? "border-success/40 bg-success/5"
      : row.status === "duplicate"
        ? "border-border bg-muted/20"
        : "border-warning/40 bg-warning/5";

  return (
    <div className={`rounded-md border p-2 text-xs ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">
            Row {row.rowNumber}: {row.title}
          </div>
          <div className="mt-0.5 text-muted-foreground">
            {row.eventDate ?? "no date"} · {row.startTime ?? "no time"} ·{" "}
            {row.goalkeeper.playerName ?? (row.parsed.goalkeeperRaw || "no goalkeeper")}
            {row.location ? ` · ${row.location}` : ""}
          </div>
        </div>
        <span className="rounded border border-border px-1.5 py-0.5 uppercase tracking-wider text-[10px]">
          {row.status.replace("_", " ")}
        </span>
      </div>

      {(row.goalkeeper.status === "ambiguous" ||
        row.goalkeeper.status === "unmatched" ||
        row.status === "needs_goalkeeper") && (
        <label className="mt-2 block">
          <span className="mb-1 block text-[11px] text-muted-foreground">
            Resolve goalkeeper for “{row.parsed.goalkeeperRaw || "blank"}”
          </span>
          <select
            value={selectedPlayerId}
            onChange={(event) => onResolveGoalkeeper(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="">Choose from roster…</option>
            {(row.goalkeeper.candidates.length ? row.goalkeeper.candidates : roster).map((player) => (
              <option key={player.id} value={player.id}>
                {player.full_name}
                {player.current_club ? ` (${player.current_club})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {!row.parsed.timeRaw.trim() && (
        <label className="mt-2 block">
          <span className="mb-1 block text-[11px] text-muted-foreground">Set kick-off for this row</span>
          <input
            type="time"
            value={timeOverride || row.startTime || ""}
            onChange={(event) => onTimeOverride(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1"
          />
        </label>
      )}

      {row.errors.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-warning">
          {row.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      {row.status === "duplicate" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Already on the calendar{row.duplicateOfEventId ? ` (${row.duplicateOfEventId.slice(0, 8)}…)` : ""}.
          Will be skipped.
        </p>
      )}
    </div>
  );
}
