import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";

import { GoalkeeperPicker } from "@/components/goalkeeper-picker";
import { MatchPicker } from "@/components/match-clips/match-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { listCalendarEvents, type TeamCalendarEvent } from "@/lib/calendar.functions";
import { todayDateOnly } from "@/lib/interactions/schema";
import {
  goalkeeperIdForMatch,
  matchLabel,
  pickableMatches,
  resolveClipMatch,
} from "@/lib/match-clips";
import {
  ACCEPT_BY_KIND,
  MAX_FILE_BYTES,
  buildObjectPath,
  formatBytes,
  formatFileLimit,
  uploadMedia,
  type MediaAsset,
} from "@/lib/media-store";
import {
  createMediaUploadItems,
  retryFailedMediaUploads,
  runMediaUploadBatch,
  type MediaUploadItem,
  type ValidMediaUploadTask,
} from "@/lib/media-upload-batch";
import { listPlayers, type PlayerRosterRow } from "@/lib/players.functions";

const ALL_MEDIA_ACCEPT = Array.from(
  new Set(Object.values(ACCEPT_BY_KIND).flatMap((value) => value.split(","))),
).join(",");

/** Row select values: follow the batch, or no match for this file only. */
const SAME_AS_BATCH = "";
const NO_MATCH = "__none__";

function newBatchId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  // `upload_batch_id` is a uuid column; this fallback only runs in old test DOMs.
  return "00000000-0000-4000-8000-000000000000".replace(/0/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

export function MatchClipUploadDialog({
  open,
  onClose,
  prefillMatchId,
}: {
  open: boolean;
  onClose: () => void;
  prefillMatchId?: string | null;
}) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  if (!open) return null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onOpenAutoFocus={() => {
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const returnTarget = returnFocusRef.current;
          returnFocusRef.current = null;
          if (returnTarget?.isConnected) returnTarget.focus();
          else document.getElementById("main-content")?.focus();
        }}
        className="flex max-h-[90vh] w-[calc(100%_-_2rem)] max-w-2xl flex-col gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
      >
        <DialogHeader className="border-b border-border px-5 py-3.5 pr-12 text-left">
          <DialogTitle className="text-base">Upload match clips</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">
            Stored in the central media repository · also listed in the Media Library
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto p-5">
          <MatchClipUploadForm onDone={onClose} prefillMatchId={prefillMatchId ?? null} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function MatchClipUploadForm({
  onDone,
  prefillMatchId,
}: {
  onDone: () => void;
  prefillMatchId: string | null;
}) {
  const { user, can } = useAuth();
  const listPlayersFn = useServerFn(listPlayers);
  const listEventsFn = useServerFn(listCalendarEvents);
  const playersQuery = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  const eventsQuery = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => listEventsFn(),
    staleTime: 60_000,
  });
  const players: PlayerRosterRow[] = playersQuery.data ?? [];
  const today = todayDateOnly();
  const matches = useMemo(
    () => pickableMatches(eventsQuery.data ?? [], today),
    [eventsQuery.data, today],
  );
  const matchesById = useMemo(
    () => new Map<string, TeamCalendarEvent>(matches.map((event) => [event.id, event])),
    [matches],
  );

  const [batchMatchId, setBatchMatchId] = useState<string | null>(prefillMatchId);
  /** Goalkeeper for clips with no match; the match decides it otherwise. */
  const [fallbackGkId, setFallbackGkId] = useState<string | null>(null);
  /** Per-file match overrides, keyed by upload item id. Absent = follow the batch. */
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  /** One id for everything sent from this dialog, retries included. */
  const [uploadBatchId] = useState(newBatchId);
  const [items, setItems] = useState<MediaUploadItem<MediaAsset>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batchMatch = batchMatchId ? (matchesById.get(batchMatchId) ?? null) : null;
  const batchGkId = batchMatch ? goalkeeperIdForMatch(batchMatch, players) : fallbackGkId;
  const playerName = (gkId: string | null) =>
    gkId ? (players.find((player) => player.id === gkId)?.full_name ?? null) : null;
  const playerClub = (gkId: string | null) =>
    gkId ? (players.find((player) => player.id === gkId)?.current_club ?? null) : null;

  // Only a match the picker can show counts: a prefilled id that is not a
  // pickable match (cancelled, in the future) must not be uploaded against
  // while the picker reads "No match yet".
  const matchForItem = (itemId: string) =>
    resolveClipMatch(batchMatch?.id ?? null, itemId in overrides ? overrides[itemId] : undefined);
  /** A file with a match takes that match's goalkeeper; without one it keeps the batch's. */
  const goalkeeperForMatchId = (matchId: string | null) =>
    matchId ? goalkeeperIdForMatch(matchesById.get(matchId), players) : batchGkId;

  if (!user || !can("media.upload")) {
    return (
      <div className="flex items-start gap-2 p-2 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 size-4 text-amber-400" />
        <span>Your role doesn't have permission to upload media. Contact an admin.</span>
      </div>
    );
  }

  const uploadedCount = items.filter((item) => item.status === "succeeded").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const queuedCount = items.filter((item) => item.status === "queued").length;
  const retryableCount = items.filter(
    (item) => item.status === "failed" && !item.validationError,
  ).length;

  if (items.length > 0 && uploadedCount === items.length) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-primary-ink" />
        <p className="mt-3 text-sm font-medium">
          {uploadedCount} {uploadedCount === 1 ? "clip" : "clips"} uploaded to Match Clips.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-4 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Close
        </button>
      </div>
    );
  }

  const handleFiles = (files: FileList | null) => {
    setError(null);
    if (!files?.length) return;
    setItems(createMediaUploadItems<MediaAsset>(Array.from(files)));
    setOverrides({});
  };

  const runBatch = async (retryFailed: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const options = {
        upload: (task: ValidMediaUploadTask, onProgress: (fraction: number) => void) => {
          const matchEventId = matchForItem(task.id);
          return uploadMedia({
            file: task.file,
            gkId: goalkeeperForMatchId(matchEventId),
            title: task.title,
            kind: task.kind,
            user,
            onProgress,
            objectPath: task.objectPath,
            matchClip: { matchEventId, uploadBatchId },
          });
        },
        resolveObjectPath: (task: ValidMediaUploadTask) =>
          task.objectPath ??
          buildObjectPath(goalkeeperForMatchId(matchForItem(task.id)), task.file.name, task.id),
        onItemUpdate: (
          _item: MediaUploadItem<MediaAsset>,
          nextItems: readonly MediaUploadItem<MediaAsset>[],
        ) => setItems([...nextItems]),
      };
      const result = retryFailed
        ? await retryFailedMediaUploads(items, options)
        : await runMediaUploadBatch(items, options);
      setItems(result);
      if (result.some((item) => item.status === "succeeded")) {
        window.dispatchEvent(new CustomEvent("rpm:media-uploaded"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (eventsQuery.isLoading) return;
    if (!items.length) {
      setError("Choose one or more clips to upload.");
      return;
    }
    await runBatch(false);
  };

  const batchGkName = playerName(batchGkId);
  const batchGkClub = playerClub(batchGkId);

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Match clips upload form">
      <Field label="Match">
        <MatchPicker
          matches={matches}
          value={batchMatch ? batchMatch.id : null}
          onValueChange={setBatchMatchId}
          today={today}
          loading={eventsQuery.isLoading}
          disabled={busy}
          error={
            eventsQuery.isError
              ? eventsQuery.error instanceof Error
                ? eventsQuery.error.message
                : "Could not load matches."
              : null
          }
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Every clip goes to this match unless you change it on the clip below.
        </p>
      </Field>

      {batchMatch ? (
        <p className="rounded-md border border-border bg-input/20 px-3 py-2 text-xs text-muted-foreground">
          Goalkeeper:{" "}
          <span className="font-medium text-foreground">
            {batchGkName ?? batchMatch.goalkeeper_name ?? "not on the fixture"}
          </span>
          {batchGkClub ? ` · ${batchGkClub}` : ""}
          {!batchGkId && " — clips will be saved without a goalkeeper link."}
        </p>
      ) : (
        <Field label="Goalkeeper">
          <GoalkeeperPicker
            players={players}
            value={fallbackGkId}
            onValueChange={(playerId) => setFallbackGkId(playerId)}
            loading={playersQuery.isLoading}
            disabled={busy}
            error={
              playersQuery.isError
                ? playersQuery.error instanceof Error
                  ? playersQuery.error.message
                  : "Could not load goalkeepers."
                : null
            }
            placeholder="No goalkeeper linked"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Optional. Clips without a match are listed under Unmatched.
          </p>
        </Field>
      )}

      <Field label="Clips">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border bg-input/30 px-4 text-center hover:border-primary/40">
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">Select all clips at once</span>
          <span className="text-[11px] text-muted-foreground">
            Up to {formatFileLimit(MAX_FILE_BYTES)} per file · filenames are kept as clip titles
          </span>
          <input
            aria-label="Clips"
            type="file"
            className="hidden"
            accept={ALL_MEDIA_ACCEPT}
            multiple
            disabled={busy}
            onChange={(event) => {
              handleFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </Field>

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {items.length} {items.length === 1 ? "file" : "files"} selected
            </span>
            {(uploadedCount > 0 || failedCount > 0) && (
              <span>
                {uploadedCount} uploaded · {failedCount} failed
              </span>
            )}
          </div>
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1" aria-label="Upload queue">
            {items.map((item) => {
              const override = item.id in overrides ? overrides[item.id] : undefined;
              const rowMatchId = matchForItem(item.id);
              const rowGk = playerName(goalkeeperForMatchId(rowMatchId));
              return (
                <ClipRow
                  key={item.id}
                  item={item}
                  selectValue={
                    override === undefined ? SAME_AS_BATCH : override === null ? NO_MATCH : override
                  }
                  batchLabel={batchMatch ? matchLabel(batchMatch) : "No match yet"}
                  goalkeeperName={rowGk}
                  matches={matches}
                  locked={busy || item.status === "succeeded" || item.status === "uploading"}
                  onSelect={(value) =>
                    setOverrides((prev) => {
                      const next = { ...prev };
                      if (value === SAME_AS_BATCH) delete next[item.id];
                      else next[item.id] = value === NO_MATCH ? null : value;
                      return next;
                    })
                  }
                />
              );
            })}
          </ul>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-md border border-border px-3 text-sm"
          disabled={busy}
        >
          {uploadedCount ? "Close" : "Cancel"}
        </button>
        {retryableCount > 0 && (
          <button
            type="button"
            onClick={() => void runBatch(true)}
            disabled={busy}
            className="h-9 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Uploading…" : `Retry ${retryableCount} failed`}
          </button>
        )}
        {queuedCount > 0 && (
          <button
            type="submit"
            // Until the calendar loads, a prefilled match cannot resolve and
            // every clip would be saved as unmatched.
            disabled={busy || eventsQuery.isLoading}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Uploading…" : `Upload ${queuedCount} ${queuedCount === 1 ? "clip" : "clips"}`}
          </button>
        )}
      </div>
    </form>
  );
}

function ClipRow({
  item,
  selectValue,
  batchLabel,
  goalkeeperName,
  matches,
  locked,
  onSelect,
}: {
  item: MediaUploadItem<MediaAsset>;
  selectValue: string;
  batchLabel: string;
  goalkeeperName: string | null;
  matches: readonly TeamCalendarEvent[];
  locked: boolean;
  onSelect: (value: string) => void;
}) {
  const percentage = Math.round(Math.min(1, Math.max(0, item.progress)) * 100);
  const status =
    item.status === "queued"
      ? "Ready"
      : item.status === "uploading"
        ? percentage >= 100
          ? "Finalising…"
          : `${percentage}%`
        : item.status === "succeeded"
          ? "Uploaded"
          : item.error || "Upload failed.";

  return (
    <li className="rounded-md border border-border bg-input/20 px-3 py-2.5">
      <div className="flex items-start gap-2">
        {item.status === "succeeded" ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden="true" />
        ) : item.status === "failed" ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : item.status === "uploading" ? (
          <Loader2
            className="mt-0.5 size-4 shrink-0 animate-spin text-primary-ink"
            aria-hidden="true"
          />
        ) : (
          <Upload className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium" title={item.title}>
              {item.title}
            </span>
            <span className="shrink-0 text-muted-foreground">{formatBytes(item.file.size)}</span>
          </div>
          <p
            className={`mt-0.5 text-[11px] ${item.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
            role={item.status === "failed" ? "alert" : "status"}
          >
            {status}
          </p>
          {item.status === "uploading" && (
            <div
              role="progressbar"
              aria-label={`${item.title} upload progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
          )}
          {!item.validationError && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <label className="sr-only" htmlFor={`clip-match-${item.id}`}>
                Match for {item.title}
              </label>
              <select
                id={`clip-match-${item.id}`}
                value={selectValue}
                disabled={locked}
                onChange={(event) => onSelect(event.target.value)}
                className="h-7 max-w-full min-w-0 flex-1 truncate rounded border border-border bg-input/60 px-1.5 text-[11px] disabled:opacity-60"
              >
                <option value={SAME_AS_BATCH}>Same as above ({batchLabel})</option>
                <option value={NO_MATCH}>No match yet</option>
                {matches.map((event) => (
                  <option key={event.id} value={event.id}>
                    {matchLabel(event)}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted-foreground">
                {goalkeeperName ?? "No goalkeeper"}
              </span>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
