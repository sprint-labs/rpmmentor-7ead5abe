import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  FileUp,
  Info,
  Megaphone,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnnouncementAttachments } from "@/components/support/announcement-attachments";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  createAnnouncement,
  createAnnouncementUploadTarget,
  discardAnnouncementDraft,
  endAnnouncement,
  listAnnouncementsAdmin,
} from "@/lib/support.functions";
import {
  ANNOUNCEMENT_KINDS,
  type AnnouncementAttachment,
  type AnnouncementKind,
  type AnnouncementRow,
} from "@/lib/support/schema";
import {
  ANNOUNCEMENT_ATTACHMENT_ACCEPT,
  MAX_ANNOUNCEMENT_ATTACHMENTS,
  formatAttachmentBytes,
  validateAnnouncementAttachment,
} from "@/lib/support/announcement-attachment-rules";
import {
  uploadAnnouncementAttachment,
  removeAnnouncementAttachment,
} from "@/lib/support/announcement-media";
import {
  ANNOUNCEMENT_KIND_LABEL,
  BROADCAST_TEMPLATES,
  announcementPlacement,
  defaultScheduledTime,
  formatBroadcastTiming,
  getBroadcastStatus,
  resolveBroadcastDates,
  type BroadcastExpiryMode,
  type BroadcastScheduleMode,
  type BroadcastStatus,
} from "@/lib/support/broadcast-utils";

const DRAFT_STORAGE_KEY = "rpm-broadcast-composer-v2";

interface SavedBroadcastDraft {
  kind: AnnouncementKind;
  title: string;
  body: string;
  scheduleMode: BroadcastScheduleMode;
  startsAtLocal: string;
  expiryMode: BroadcastExpiryMode;
  endsAtLocal: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

const INITIAL_DRAFT: SavedBroadcastDraft = {
  kind: "feature",
  title: "",
  body: "",
  scheduleMode: "now",
  startsAtLocal: "",
  expiryMode: "none",
  endsAtLocal: "",
};

export function BroadcastManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const list = useServerFn(listAnnouncementsAdmin);
  const create = useServerFn(createAnnouncement);
  const prepareUpload = useServerFn(createAnnouncementUploadTarget);
  const discard = useServerFn(discardAnnouncementDraft);
  const end = useServerFn(endAnnouncement);
  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingAttachment[]>([]);

  const [draft, setDraft] = useState<SavedBroadcastDraft>(INITIAL_DRAFT);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["announcements", "admin", "all"],
    queryFn: () => list({ data: { page: 1, pageSize: 30 } }),
    staleTime: 30_000,
  });

  useEffect(() => {
    pendingRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(
    () => () => {
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [],
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SavedBroadcastDraft>;
        if (
          parsed.kind &&
          (ANNOUNCEMENT_KINDS as readonly string[]).includes(parsed.kind) &&
          typeof parsed.title === "string" &&
          typeof parsed.body === "string"
        ) {
          setDraft({
            kind: parsed.kind,
            title: parsed.title,
            body: parsed.body,
            scheduleMode: parsed.scheduleMode === "later" ? "later" : "now",
            startsAtLocal: typeof parsed.startsAtLocal === "string" ? parsed.startsAtLocal : "",
            expiryMode:
              parsed.expiryMode === "24h" ||
              parsed.expiryMode === "7d" ||
              parsed.expiryMode === "custom"
                ? parsed.expiryMode
                : "none",
            endsAtLocal: typeof parsed.endsAtLocal === "string" ? parsed.endsAtLocal : "",
          });
        }
      }
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        setLastSavedAt(Date.now());
      } catch {
        // Draft saving is a convenience only. Publishing remains available.
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, draftHydrated]);

  const previewAttachments = useMemo<AnnouncementAttachment[]>(
    () =>
      pendingFiles.map((item) => ({
        path: `local:${item.id}`,
        fileName: item.file.name,
        mimeType: item.file.type,
        fileSize: item.file.size,
        url: item.previewUrl,
      })),
    [pendingFiles],
  );

  const attachmentEnabled = draft.kind === "feature" || draft.kind === "info";
  const recent = data?.rows ?? [];

  function updateDraft(patch: Partial<SavedBroadcastDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError(null);
  }

  function clearPendingFiles() {
    setPendingFiles((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetComposer() {
    clearPendingFiles();
    setDraft(INITIAL_DRAFT);
    setFormError(null);
    setReviewOpen(false);
    setLastSavedAt(null);
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // No action required when browser storage is unavailable.
    }
  }

  function selectKind(nextKind: AnnouncementKind) {
    if ((nextKind === "incident" || nextKind === "downtime") && pendingFiles.length > 0) {
      toast.error("Remove the media attachments before switching to a service alert.");
      return;
    }
    updateDraft({ kind: nextKind });
  }

  function applyTemplate(templateId: string) {
    const template = BROADCAST_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    if ((template.kind === "incident" || template.kind === "downtime") && pendingFiles.length > 0) {
      toast.error("Remove the media attachments before using a service alert template.");
      return;
    }
    updateDraft({ kind: template.kind, title: template.title, body: template.body });
  }

  function addFiles(files: File[]) {
    if (!attachmentEnabled) {
      toast.error("Media can be attached to feature and update broadcasts.");
      return;
    }

    if (pendingFiles.length + files.length > MAX_ANNOUNCEMENT_ATTACHMENTS) {
      toast.error("A broadcast can have one media attachment.");
      return;
    }

    for (const file of files) {
      const validationError = validateAnnouncementAttachment(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }

    const next = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingFiles((current) => [...current, ...next]);
  }

  function removeFile(id: string) {
    setPendingFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function validateComposer(): string | null {
    if (!draft.title.trim()) return "Add a broadcast title.";
    if (draft.title.trim().length > 160) return "Keep the title within 160 characters.";
    if (draft.body.trim().length > 4000) return "Keep the message within 4,000 characters.";
    if (!attachmentEnabled && pendingFiles.length > 0) {
      return "Service alerts cannot include media attachments.";
    }

    try {
      resolveBroadcastDates({
        scheduleMode: draft.scheduleMode,
        startsAtLocal: draft.startsAtLocal,
        expiryMode: draft.expiryMode,
        endsAtLocal: draft.endsAtLocal,
      });
    } catch (cause) {
      return cause instanceof Error ? cause.message : "Check the delivery timing.";
    }

    return null;
  }

  function openReview() {
    const nextError = validateComposer();
    if (nextError) {
      setFormError(nextError);
      return;
    }
    setFormError(null);
    setReviewOpen(true);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Your session is unavailable. Refresh and try again.");
      const timing = resolveBroadcastDates({
        scheduleMode: draft.scheduleMode,
        startsAtLocal: draft.startsAtLocal,
        expiryMode: draft.expiryMode,
        endsAtLocal: draft.endsAtLocal,
      });
      const hasAttachments = pendingFiles.length > 0;
      let uploadedPath: string | null = null;

      try {
        let attachment:
          | {
              path: string;
              fileName: string;
              mimeType: string;
              fileSize: number;
            }
          | undefined;

        if (hasAttachments) {
          const item = pendingFiles[0];
          if (!item) throw new Error("Choose a media file before publishing.");
          const target = await prepareUpload({
            data: {
              fileName: item.file.name,
              mimeType: item.file.type,
              fileSize: item.file.size,
            },
          });
          uploadedPath = await uploadAnnouncementAttachment(item.file, target);
          attachment = {
            path: uploadedPath,
            fileName: item.file.name,
            mimeType: item.file.type,
            fileSize: item.file.size,
          };
        }

        return await create({
          data: {
            kind: draft.kind,
            title: draft.title,
            body: draft.body,
            startsAt: timing.startsAt,
            endsAt: timing.endsAt,
            attachment,
          },
        });
      } catch (cause) {
        if (uploadedPath) {
          await removeAnnouncementAttachment(uploadedPath);
        }
        throw cause;
      }
    },
    onSuccess: async () => {
      toast.success(draft.scheduleMode === "later" ? "Broadcast scheduled" : "Broadcast posted");
      resetComposer();
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  const endMutation = useMutation({
    mutationFn: (announcementId: string) => end({ data: { announcementId } }),
    onSuccess: async () => {
      toast.success("Broadcast ended");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  const discardMutation = useMutation({
    mutationFn: (announcementId: string) => discard({ data: { announcementId } }),
    onSuccess: async () => {
      toast.success("Draft discarded");
      await refetch();
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  function duplicateAnnouncement(announcement: AnnouncementRow) {
    clearPendingFiles();
    setDraft({
      kind: announcement.kind,
      title: announcement.title,
      body: announcement.body,
      scheduleMode: "now",
      startsAtLocal: "",
      expiryMode: "none",
      endsAtLocal: "",
    });
    setFormError(null);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.success(
      announcement.attachments?.length
        ? "Text copied. Attach the media again before publishing."
        : "Broadcast copied into the composer.",
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <div ref={composerRef}>
          <Card className="space-y-5 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Megaphone className="size-4 text-primary" />
                  <h2 className="text-base font-semibold">Create broadcast</h2>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Share product updates or urgent service notices with every signed in user.
                </p>
              </div>
              <div className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                <div>Draft autosave</div>
                <div className="mt-0.5 normal-case tracking-normal">
                  {lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : "Ready"}
                </div>
              </div>
            </div>

            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3.5" /> Start with a template
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {BROADCAST_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id)}
                    className="rounded-md border border-border p-2.5 text-left hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="text-xs font-medium">{template.label}</div>
                    <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      {template.description}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
                <label className="block text-xs font-medium text-muted-foreground">
                  Broadcast type
                  <select
                    value={draft.kind}
                    onChange={(event) => selectKind(event.target.value as AnnouncementKind)}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {ANNOUNCEMENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {ANNOUNCEMENT_KIND_LABEL[kind]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-medium text-muted-foreground">
                  Title
                  <input
                    value={draft.title}
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    maxLength={160}
                    placeholder="What should users know?"
                    className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                  <span className="mt-1 block text-right text-[10px] font-normal">
                    {draft.title.length}/160
                  </span>
                </label>
              </div>

              <label className="block text-xs font-medium text-muted-foreground">
                Message
                <textarea
                  value={draft.body}
                  onChange={(event) => updateDraft({ body: event.target.value })}
                  maxLength={4000}
                  rows={8}
                  placeholder="Explain the change, why it matters and any action users need to take."
                  className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-relaxed"
                />
                <span className="mt-1 block text-right text-[10px] font-normal">
                  {draft.body.length}/4000
                </span>
              </label>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Paperclip className="size-3.5" /> Media
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Up to one image, video, audio file or PDF. Service alerts stay text only for
                    clarity.
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {pendingFiles.length}/{MAX_ANNOUNCEMENT_ATTACHMENTS}
                </span>
              </div>

              <label
                className={cn(
                  "flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-4 text-center transition-colors",
                  attachmentEnabled
                    ? "border-border hover:border-primary/50 hover:bg-primary/5"
                    : "cursor-not-allowed border-border/60 bg-muted/20 opacity-60",
                )}
                onDragOver={(event) => {
                  if (!attachmentEnabled) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!attachmentEnabled) return;
                  event.preventDefault();
                  addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <FileUp className="size-5 text-muted-foreground" />
                <span className="mt-2 text-xs font-medium">
                  {attachmentEnabled
                    ? "Choose files or drop them here"
                    : "Media is unavailable for service alerts"}
                </span>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  Maximum 25 MB per file
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  disabled={!attachmentEnabled}
                  accept={ANNOUNCEMENT_ATTACHMENT_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
              </label>

              {pendingFiles.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {pendingFiles.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-muted/15 px-3 py-2"
                    >
                      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{item.file.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatAttachmentBytes(item.file.size)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3 rounded-md border border-border bg-muted/10 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="size-3.5" /> Delivery
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-medium">Start</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["now", "later"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          updateDraft({
                            scheduleMode: mode,
                            startsAtLocal:
                              mode === "later" ? draft.startsAtLocal || defaultScheduledTime() : "",
                          })
                        }
                        className={cn(
                          "h-9 rounded-md border text-xs font-medium",
                          draft.scheduleMode === mode
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-accent/40",
                        )}
                      >
                        {mode === "now" ? "Post now" : "Schedule"}
                      </button>
                    ))}
                  </div>
                  {draft.scheduleMode === "later" && (
                    <input
                      type="datetime-local"
                      value={draft.startsAtLocal}
                      onChange={(event) => updateDraft({ startsAtLocal: event.target.value })}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  )}
                </div>

                <label className="block text-xs font-medium">
                  End
                  <select
                    value={draft.expiryMode}
                    onChange={(event) =>
                      updateDraft({
                        expiryMode: event.target.value as BroadcastExpiryMode,
                        endsAtLocal: event.target.value === "custom" ? draft.endsAtLocal : "",
                      })
                    }
                    className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-xs"
                  >
                    <option value="none">No automatic end</option>
                    <option value="24h">After 24 hours</option>
                    <option value="7d">After 7 days</option>
                    <option value="custom">Custom date and time</option>
                  </select>
                  {draft.expiryMode === "custom" && (
                    <input
                      type="datetime-local"
                      value={draft.endsAtLocal}
                      onChange={(event) => updateDraft({ endsAtLocal: event.target.value })}
                      className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    />
                  )}
                </label>
              </div>
            </section>

            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={resetComposer}
                disabled={createMutation.isPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-60"
              >
                <RotateCcw className="size-3.5" /> Clear draft
              </button>
              <button
                type="button"
                onClick={openReview}
                disabled={createMutation.isPending || !draft.title.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Send className="size-4" /> Review broadcast
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-4 self-start xl:sticky xl:top-20">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Live preview</h2>
              <span className="rounded bg-muted px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                User view
              </span>
            </div>
            <BroadcastPreview
              kind={draft.kind}
              title={draft.title}
              body={draft.body}
              attachments={previewAttachments}
            />
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Delivery summary</h2>
            <SummaryRow label="Audience" value="All signed in users" />
            <SummaryRow label="Appears in" value={announcementPlacement(draft.kind)} />
            <SummaryRow
              label="Timing"
              value={formatBroadcastTiming({
                scheduleMode: draft.scheduleMode,
                startsAtLocal: draft.startsAtLocal,
                expiryMode: draft.expiryMode,
                endsAtLocal: draft.endsAtLocal,
              })}
            />
            <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Every post requires a final review before it is sent. Media is uploaded only after you
              confirm.
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Broadcast history</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Live, scheduled and recently ended broadcasts.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {data?.total ?? 0} total
          </span>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading broadcasts…
          </div>
        ) : isError ? (
          <div className="px-4 py-8 text-center text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No broadcasts have been posted yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((announcement) => {
              const status = getBroadcastStatus(announcement);
              const canEnd = status === "live" || status === "scheduled";
              return (
                <li key={announcement.id} className="px-4 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={status} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {ANNOUNCEMENT_KIND_LABEL[announcement.kind]}
                        </span>
                        {Boolean(announcement.attachments?.length) && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Paperclip className="size-3" /> {announcement.attachments?.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 truncate text-sm font-medium">
                        {announcement.title}
                      </div>
                      {announcement.body && (
                        <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                          {announcement.body}
                        </div>
                      )}
                      <div className="mt-1.5 text-[10px] text-muted-foreground">
                        Starts {new Date(announcement.startsAt).toLocaleString()}
                        {announcement.endsAt
                          ? ` · Ends ${new Date(announcement.endsAt).toLocaleString()}`
                          : " · No automatic end"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <button
                        type="button"
                        onClick={() => duplicateAnnouncement(announcement)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent"
                      >
                        <Copy className="size-3.5" /> Duplicate
                      </button>
                      {canEnd && (
                        <button
                          type="button"
                          disabled={endMutation.isPending}
                          onClick={() => {
                            if (window.confirm("End this broadcast now?")) {
                              endMutation.mutate(announcement.id);
                            }
                          }}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          <Trash2 className="size-3.5" /> End now
                        </button>
                      )}
                      {status === "draft" && (
                        <button
                          type="button"
                          disabled={discardMutation.isPending}
                          onClick={() => discardMutation.mutate(announcement.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          <Trash2 className="size-3.5" /> Discard draft
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog
        open={reviewOpen}
        onOpenChange={(next) => !createMutation.isPending && setReviewOpen(next)}
      >
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review broadcast</DialogTitle>
            <DialogDescription>
              Check the exact message, placement and timing before it is sent.
            </DialogDescription>
          </DialogHeader>

          <BroadcastPreview
            kind={draft.kind}
            title={draft.title}
            body={draft.body}
            attachments={previewAttachments}
          />

          <div className="grid gap-2 rounded-md border border-border bg-muted/10 p-3 text-xs sm:grid-cols-3">
            <SummaryRow label="Audience" value="All signed in users" />
            <SummaryRow label="Placement" value={announcementPlacement(draft.kind)} />
            <SummaryRow
              label="Timing"
              value={formatBroadcastTiming({
                scheduleMode: draft.scheduleMode,
                startsAtLocal: draft.startsAtLocal,
                expiryMode: draft.expiryMode,
                endsAtLocal: draft.endsAtLocal,
              })}
            />
          </div>

          <DialogFooter className="gap-2 sm:space-x-0">
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              disabled={createMutation.isPending}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent disabled:opacity-60"
            >
              Back to edit
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {createMutation.isPending ? (
                <>
                  <Clock3 className="size-4 animate-spin" /> Uploading and publishing…
                </>
              ) : draft.scheduleMode === "later" ? (
                <>
                  <CalendarClock className="size-4" /> Schedule broadcast
                </>
              ) : (
                <>
                  <Send className="size-4" /> Post broadcast
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BroadcastPreview({
  kind,
  title,
  body,
  attachments,
}: {
  kind: AnnouncementKind;
  title: string;
  body: string;
  attachments: AnnouncementAttachment[];
}) {
  const serviceAlert = kind === "incident" || kind === "downtime";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border",
        serviceAlert ? "border-destructive/45 bg-destructive/5" : "border-border bg-popover",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            serviceAlert ? "text-destructive" : "text-primary",
          )}
        >
          {ANNOUNCEMENT_KIND_LABEL[kind]}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {serviceAlert ? "Service notice" : "Help & updates"}
        </span>
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold">{title.trim() || "Your broadcast title"}</div>
        <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {body.trim() || "Your message will appear here as you type."}
        </div>
        <AnnouncementAttachments attachments={attachments} compact className="mt-3" />
        <div className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <CheckCircle2 className="size-3" /> Users can mark this update as read
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xs leading-relaxed">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: BroadcastStatus }) {
  const labels: Record<BroadcastStatus, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    live: "Live",
    ended: "Ended",
  };
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        status === "live" && "bg-primary/15 text-primary",
        status === "scheduled" && "bg-warning/15 text-warning",
        status === "draft" && "bg-muted text-muted-foreground",
        status === "ended" && "bg-muted text-muted-foreground",
      )}
    >
      {labels[status]}
    </span>
  );
}
