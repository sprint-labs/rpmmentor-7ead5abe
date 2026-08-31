import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  FileUp,
  Info,
  Megaphone,
  Radio,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/primitives";
import {
  AnnouncementMedia,
  ANNOUNCEMENT_KIND_DESCRIPTION,
  ANNOUNCEMENT_KIND_LABEL,
  formatAttachmentSize,
} from "@/components/announcement-media";
import { cn } from "@/lib/utils";
import {
  createAnnouncement,
  endAnnouncement,
  listAdminAnnouncements,
} from "@/lib/support.functions";
import type {
  AnnouncementAttachment,
  AnnouncementKind,
  AnnouncementRow,
} from "@/lib/support/schema";
import {
  ANNOUNCEMENT_ATTACHMENT_ACCEPT,
  announcementAttachmentError,
  removeAnnouncementAttachment,
  uploadAnnouncementAttachment,
} from "@/lib/support/announcement-attachments";

const DRAFT_KEY = "rpm-broadcast-draft-v2";

type PublishMode = "now" | "later";
type ExpiryMode = "none" | "24h" | "7d" | "custom";

type StoredDraft = {
  kind: AnnouncementKind;
  title: string;
  body: string;
  publishMode: PublishMode;
  startsAt: string;
  expiryMode: ExpiryMode;
  endsAt: string;
};

const KIND_META: Record<
  AnnouncementKind,
  { icon: typeof Sparkles; accent: string; iconClass: string }
> = {
  feature: {
    icon: Sparkles,
    accent: "border-primary/40 bg-primary/5",
    iconClass: "text-primary",
  },
  info: {
    icon: Info,
    accent: "border-sky-500/40 bg-sky-500/5",
    iconClass: "text-sky-500",
  },
  incident: {
    icon: AlertTriangle,
    accent: "border-amber-500/40 bg-amber-500/5",
    iconClass: "text-amber-500",
  },
  downtime: {
    icon: Wrench,
    accent: "border-destructive/40 bg-destructive/5",
    iconClass: "text-destructive",
  },
};

function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function defaultScheduledAt(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return toDateTimeLocal(date);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusOf(
  announcement: AnnouncementRow,
  now: number,
): "live" | "scheduled" | "ended" {
  if (!announcement.active) return "ended";
  if (announcement.endsAt && Date.parse(announcement.endsAt) <= now) return "ended";
  if (Date.parse(announcement.startsAt) > now) return "scheduled";
  return "live";
}

function statusLabel(announcement: AnnouncementRow, now: number): string {
  const status = statusOf(announcement, now);
  if (status === "scheduled") return `Scheduled for ${formatDateTime(announcement.startsAt)}`;
  if (status === "ended") {
    return announcement.endsAt ? `Ended ${formatDateTime(announcement.endsAt)}` : "Ended";
  }
  if (announcement.endsAt) return `Live until ${formatDateTime(announcement.endsAt)}`;
  return "Live until ended manually";
}

function BroadcastStatusBadge({
  announcement,
  now,
}: {
  announcement: AnnouncementRow;
  now: number;
}) {
  const status = statusOf(announcement, now);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        status === "live" && "border-primary/40 bg-primary/10 text-primary",
        status === "scheduled" && "border-sky-500/40 bg-sky-500/10 text-sky-500",
        status === "ended" && "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      {status === "live" ? (
        <Radio className="size-3" aria-hidden="true" />
      ) : status === "scheduled" ? (
        <CalendarClock className="size-3" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-3" aria-hidden="true" />
      )}
      {status}
    </span>
  );
}

export function BroadcastCentre() {
  const queryClient = useQueryClient();
  const list = useServerFn(listAdminAnnouncements);
  const create = useServerFn(createAnnouncement);
  const end = useServerFn(endAnnouncement);
  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<AnnouncementKind>("feature");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishMode, setPublishMode] = useState<PublishMode>("now");
  const [startsAt, setStartsAt] = useState(defaultScheduledAt);
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("none");
  const [endsAt, setEndsAt] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<StoredDraft>;
        if (draft.kind && ["feature", "info", "incident", "downtime"].includes(draft.kind)) {
          setKind(draft.kind);
        }
        if (typeof draft.title === "string") setTitle(draft.title);
        if (typeof draft.body === "string") setBody(draft.body);
        if (draft.publishMode === "now" || draft.publishMode === "later") {
          setPublishMode(draft.publishMode);
        }
        if (typeof draft.startsAt === "string" && draft.startsAt) setStartsAt(draft.startsAt);
        if (
          draft.expiryMode === "none" ||
          draft.expiryMode === "24h" ||
          draft.expiryMode === "7d" ||
          draft.expiryMode === "custom"
        ) {
          setExpiryMode(draft.expiryMode);
        }
        if (typeof draft.endsAt === "string") setEndsAt(draft.endsAt);
      }
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const draft: StoredDraft = {
      kind,
      title,
      body,
      publishMode,
      startsAt,
      expiryMode,
      endsAt,
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [body, draftReady, endsAt, expiryMode, kind, publishMode, startsAt, title]);

  useEffect(() => {
    if (!attachmentFile) {
      setAttachmentPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachmentFile);
    setAttachmentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachmentFile]);

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["announcements", "admin", "all"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const now = Date.now();
  const live = data.filter((announcement) => statusOf(announcement, now) === "live");
  const scheduled = data.filter((announcement) => statusOf(announcement, now) === "scheduled");
  const recent = data
    .filter((announcement) => statusOf(announcement, now) === "ended")
    .slice(0, 8);

  const previewAttachment = useMemo<AnnouncementAttachment | null>(() => {
    if (!attachmentFile) return null;
    return {
      path: "preview",
      name: attachmentFile.name,
      mime: attachmentFile.type || "application/octet-stream",
      size: attachmentFile.size,
    };
  }, [attachmentFile]);

  function setAttachment(file: File | null) {
    if (!file) {
      setAttachmentFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const error = announcementAttachmentError(file);
    if (error) {
      toast.error(error);
      return;
    }
    setAttachmentFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setAttachment(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    setAttachment(event.dataTransfer.files?.[0] ?? null);
  }

  function resolvedStart(): Date {
    if (publishMode === "now") return new Date();
    const date = new Date(startsAt);
    if (!startsAt || Number.isNaN(date.getTime())) throw new Error("Choose a valid publish time.");
    if (date.getTime() <= Date.now() + 30_000) {
      throw new Error("Scheduled broadcasts need a future publish time.");
    }
    return date;
  }

  function resolvedEnd(start: Date): string | null {
    if (expiryMode === "none") return null;
    if (expiryMode === "24h") return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
    if (expiryMode === "7d") return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const date = new Date(endsAt);
    if (!endsAt || Number.isNaN(date.getTime())) throw new Error("Choose a valid end time.");
    if (date.getTime() <= start.getTime()) {
      throw new Error("The end time must be after the publish time.");
    }
    return date.toISOString();
  }

  function clearComposer() {
    setKind("feature");
    setTitle("");
    setBody("");
    setPublishMode("now");
    setStartsAt(defaultScheduledAt());
    setExpiryMode("none");
    setEndsAt("");
    setAttachment(null);
    window.localStorage.removeItem(DRAFT_KEY);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Add a title before publishing.");
      const start = resolvedStart();
      const endAt = resolvedEnd(start);
      let uploaded: AnnouncementAttachment | null = null;

      try {
        if (attachmentFile) uploaded = await uploadAnnouncementAttachment(attachmentFile);
        return await create({
          data: {
            kind,
            title: title.trim(),
            body: body.trim(),
            startsAt: start.toISOString(),
            endsAt: endAt,
            attachment: uploaded,
          },
        });
      } catch (error) {
        if (uploaded) await removeAnnouncementAttachment(uploaded.path);
        throw error;
      }
    },
    onSuccess: async (announcement) => {
      toast.success(
        Date.parse(announcement.startsAt) > Date.now()
          ? "Broadcast scheduled"
          : "Broadcast published",
      );
      clearComposer();
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const endMutation = useMutation({
    mutationFn: (announcementId: string) => end({ data: { announcementId } }),
    onSuccess: async () => {
      toast.success("Broadcast ended");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function duplicateAnnouncement(announcement: AnnouncementRow) {
    setKind(announcement.kind);
    setTitle(announcement.title);
    setBody(announcement.body);
    setPublishMode("now");
    setStartsAt(defaultScheduledAt());
    setExpiryMode("none");
    setEndsAt("");
    setAttachment(null);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.success("Broadcast copied into the composer");
  }

  const placementCopy =
    kind === "incident" || kind === "downtime"
      ? "Shown as a service alert, in notifications and inside Help & updates."
      : "Shown inside Help & updates for every signed in user.";

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <Megaphone className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Broadcast centre</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                Publish product updates and service notices to everyone in the Mentor Hub.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="rounded-md border border-border bg-background/70 px-3 py-2 text-xs">
              <strong className="text-foreground">{live.length}</strong>{" "}
              <span className="text-muted-foreground">live</span>
            </span>
            <span className="rounded-md border border-border bg-background/70 px-3 py-2 text-xs">
              <strong className="text-foreground">{scheduled.length}</strong>{" "}
              <span className="text-muted-foreground">scheduled</span>
            </span>
          </div>
        </div>
        <div className="grid gap-3 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
            Audience: all signed in users
          </div>
          <div className="flex items-center gap-2">
            <FileUp className="size-4 text-primary" aria-hidden="true" />
            Images, video, audio or PDF
          </div>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" aria-hidden="true" />
            Publish now or schedule ahead
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <Card ref={composerRef} className="space-y-5 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Create broadcast</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your text draft is saved on this device as you type.
              </p>
            </div>
            {(title || body || attachmentFile) && (
              <button
                type="button"
                onClick={clearComposer}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Trash2 className="size-3.5" aria-hidden="true" /> Clear
              </button>
            )}
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-foreground">What kind of message is this?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Object.keys(KIND_META) as AnnouncementKind[]).map((option) => {
                const meta = KIND_META[option];
                const Icon = meta.icon;
                const selected = kind === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setKind(option)}
                    className={cn(
                      "flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition-colors",
                      selected
                        ? meta.accent
                        : "border-border bg-background hover:border-foreground/20 hover:bg-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted/60",
                        meta.iconClass,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold">
                        {ANNOUNCEMENT_KIND_LABEL[option]}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                        {ANNOUNCEMENT_KIND_DESCRIPTION[option]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-4">
            <label className="block">
              <span className="flex items-center justify-between gap-2 text-xs font-medium">
                <span>Title</span>
                <span className="font-normal text-muted-foreground">{title.length}/160</span>
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                placeholder={
                  kind === "feature"
                    ? "Example: Match report uploads are now faster"
                    : kind === "incident"
                      ? "Example: Media uploads are temporarily unavailable"
                      : "Add a clear, useful headline"
                }
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>

            <label className="block">
              <span className="flex items-center justify-between gap-2 text-xs font-medium">
                <span>Message</span>
                <span className="font-normal text-muted-foreground">{body.length}/4000</span>
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                rows={7}
                placeholder="Explain what changed, what users need to know and any action they should take."
                className="mt-1.5 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium">Media attachment</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Optional. One file, up to 25 MB.
                </div>
              </div>
              {attachmentFile && (
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" /> Remove
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ANNOUNCEMENT_ATTACHMENT_ACCEPT}
              onChange={handleFileChange}
              className="sr-only"
            />
            {attachmentFile ? (
              <div className="mt-2 rounded-md border border-border bg-muted/15 p-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <FileUp className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{attachmentFile.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatAttachmentSize(attachmentFile.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 rounded-md border border-border px-2.5 text-xs hover:bg-accent"
                  >
                    Replace
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
                className={cn(
                  "mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-5 text-center outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/10 hover:border-foreground/30 hover:bg-muted/20",
                )}
              >
                <FileUp className="size-5 text-muted-foreground" aria-hidden="true" />
                <div className="mt-2 text-xs font-medium">Drop a file here or choose one</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Images, MP4, MOV, WebM, audio and PDF
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 rounded-md border border-border bg-muted/10 p-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium">Publish</div>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                {(["now", "later"] as PublishMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={publishMode === mode}
                    onClick={() => setPublishMode(mode)}
                    className={cn(
                      "h-8 rounded text-xs font-medium",
                      publishMode === mode
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode === "now" ? "Now" : "Schedule"}
                  </button>
                ))}
              </div>
              {publishMode === "later" && (
                <label className="mt-3 block text-[11px] text-muted-foreground">
                  Publish date and time
                  <input
                    type="datetime-local"
                    value={startsAt}
                    min={toDateTimeLocal(new Date())}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
                  />
                </label>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium">
                End broadcast
                <select
                  value={expiryMode}
                  onChange={(event) => setExpiryMode(event.target.value as ExpiryMode)}
                  className="mt-2 h-10 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                >
                  <option value="none">No automatic end</option>
                  <option value="24h">After 24 hours</option>
                  <option value="7d">After 7 days</option>
                  <option value="custom">Choose date and time</option>
                </select>
              </label>
              {expiryMode === "custom" && (
                <label className="mt-3 block text-[11px] text-muted-foreground">
                  End date and time
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {placementCopy}
            </div>
            <button
              type="button"
              disabled={createMutation.isPending || !title.trim()}
              onClick={() => createMutation.mutate()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? (
                "Publishing…"
              ) : (
                <>
                  <Send className="size-4" aria-hidden="true" />
                  {publishMode === "later" ? "Schedule broadcast" : "Publish broadcast"}
                </>
              )}
            </button>
          </div>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-20">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Live preview</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  How this will look inside Help & updates
                </p>
              </div>
              <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                All users
              </span>
            </div>
            <div className="bg-background p-3">
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                  <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                    <Megaphone className="size-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-xs font-semibold">Help & updates</div>
                    <div className="text-[10px] text-muted-foreground">Updates</div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {ANNOUNCEMENT_KIND_LABEL[kind]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {publishMode === "later" ? "Scheduled" : "Just now"}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold leading-snug">
                    {title.trim() || "Your broadcast title"}
                  </div>
                  <div
                    className={cn(
                      "mt-1.5 whitespace-pre-wrap text-xs leading-relaxed",
                      body.trim() ? "text-muted-foreground" : "italic text-muted-foreground/60",
                    )}
                  >
                    {body.trim() || "Your message will appear here as you type."}
                  </div>
                  <AnnouncementMedia
                    attachment={previewAttachment}
                    previewUrl={attachmentPreviewUrl}
                    compact
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Delivery
            </h3>
            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <div className="font-medium">Help & updates</div>
                  <div className="mt-0.5 text-muted-foreground">
                    Users can read and dismiss the message from the global header.
                  </div>
                </div>
              </div>
              {(kind === "incident" || kind === "downtime") && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <div>
                    <div className="font-medium">Service alert</div>
                    <div className="mt-0.5 text-muted-foreground">
                      Also shown prominently above every page and inside notifications.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Active and scheduled broadcasts</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Review what users can see now and what is queued next.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="h-8 self-start rounded-md border border-border px-2.5 text-xs hover:bg-accent sm:self-auto"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Loading broadcasts…
          </div>
        ) : isError ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            Broadcasts could not be loaded.
          </div>
        ) : live.length + scheduled.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
              <Megaphone className="size-4" aria-hidden="true" />
            </span>
            <div className="mt-3 text-sm font-medium">Nothing live or scheduled</div>
            <div className="mt-1 max-w-sm text-xs text-muted-foreground">
              Publish a broadcast above and it will appear here for quick management.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...live, ...scheduled].map((announcement) => {
              const meta = KIND_META[announcement.kind];
              const Icon = meta.icon;
              return (
                <div
                  key={announcement.id}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-md bg-muted/40",
                        meta.iconClass,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <BroadcastStatusBadge announcement={announcement} now={now} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {ANNOUNCEMENT_KIND_LABEL[announcement.kind]}
                        </span>
                        {announcement.attachment && (
                          <span className="text-[10px] text-muted-foreground">Attachment</span>
                        )}
                      </div>
                      <div className="mt-1.5 text-sm font-semibold">{announcement.title}</div>
                      {announcement.body && (
                        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {announcement.body}
                        </div>
                      )}
                      <div className="mt-1.5 text-[10px] text-muted-foreground">
                        {statusLabel(announcement, now)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-12 lg:pl-0">
                    <button
                      type="button"
                      onClick={() => duplicateAnnouncement(announcement)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent"
                    >
                      <Copy className="size-3.5" aria-hidden="true" /> Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={endMutation.isPending}
                      onClick={() => endMutation.mutate(announcement.id)}
                      className="h-8 rounded-md border border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      End
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {recent.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Recent broadcasts</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Ended messages kept for reference and easy reuse.
            </p>
          </div>
          <div className="divide-y divide-border">
            {recent.map((announcement) => (
              <div
                key={announcement.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {ANNOUNCEMENT_KIND_LABEL[announcement.kind]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateTime(announcement.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs font-medium">{announcement.title}</div>
                </div>
                <button
                  type="button"
                  onClick={() => duplicateAnnouncement(announcement)}
                  className="inline-flex h-8 items-center gap-1.5 self-start rounded-md border border-border px-2.5 text-xs hover:bg-accent sm:self-auto"
                >
                  <Copy className="size-3.5" aria-hidden="true" /> Reuse
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
