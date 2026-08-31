import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bug, Check, LifeBuoy, Megaphone, MessageSquarePlus, X } from "lucide-react";
import type { AnnouncementRow } from "@/lib/support/schema";
import { AnnouncementAttachments } from "@/components/support/announcement-attachments";
import { cn } from "@/lib/utils";

const HELP_UPDATES_HINT_STORAGE_KEY = "rpm-help-updates-intro-v1";

interface HelpUpdatesLauncherProps {
  open: boolean;
  unreadCount: number;
  announcements: AnnouncementRow[];
  announcementsPending: boolean;
  announcementsError: boolean;
  introVisible?: boolean;
  onOpenChange: (open: boolean) => void;
  onAskQuestion: () => void;
  onReportProblem: () => void;
  onOpenMessages: () => void;
  onMarkAnnouncementRead: (announcementId: string) => void | Promise<void>;
}

const ANNOUNCEMENT_LABEL: Record<AnnouncementRow["kind"], string> = {
  feature: "New feature",
  info: "Update",
  incident: "Incident",
  downtime: "Downtime",
};

export function HelpUpdatesLauncher({
  open,
  unreadCount,
  announcements,
  announcementsPending,
  announcementsError,
  introVisible = true,
  onOpenChange,
  onAskQuestion,
  onReportProblem,
  onOpenMessages,
  onMarkAnnouncementRead,
}: HelpUpdatesLauncherProps) {
  const [showIntro, setShowIntro] = useState(false);
  const [pinnedAnnouncementId, setPinnedAnnouncementId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      setShowIntro(window.localStorage.getItem(HELP_UPDATES_HINT_STORAGE_KEY) !== "seen");
    } catch {
      // Storage can be unavailable in locked-down browsers. The launcher still works.
    }
  }, []);

  useEffect(() => {
    if (!open) setPinnedAnnouncementId(null);
  }, [open]);

  const visibleAnnouncements = useMemo(() => {
    const unread = announcements.filter((announcement) => !announcement.readAt);
    const read = announcements.filter((announcement) => announcement.readAt);
    const pinned = pinnedAnnouncementId
      ? read.filter((announcement) => announcement.id === pinnedAnnouncementId)
      : [];
    const recentRead = read.filter((announcement) => announcement.id !== pinnedAnnouncementId);
    const readSlots = Math.max(0, 3 - unread.length - pinned.length);

    return [...unread, ...pinned, ...recentRead.slice(0, readSlots)];
  }, [announcements, pinnedAnnouncementId]);

  function rememberIntro() {
    setShowIntro(false);
    try {
      window.localStorage.setItem(HELP_UPDATES_HINT_STORAGE_KEY, "seen");
    } catch {
      // Do not block support access when storage is unavailable.
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) rememberIntro();
    onOpenChange(next);
  }

  function runAction(action: () => void) {
    pendingActionRef.current = action;
    handleOpenChange(false);
  }

  const cappedUnread = unreadCount > 9 ? "9+" : unreadCount;

  return (
    <div className="relative shrink-0">
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={
              unreadCount > 0
                ? `${open ? "Close" : "Open"} Help and updates, ${cappedUnread} new`
                : `${open ? "Close" : "Open"} Help and updates`
            }
            aria-controls="help-updates-dialog"
            className="relative inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-semibold uppercase tracking-[0.06em] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:size-9 lg:w-auto lg:px-3"
          >
            <LifeBuoy className="size-4" aria-hidden="true" />
            <span className="hidden lg:inline">Help & updates</span>
            {unreadCount > 0 && (
              <span
                className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground"
                aria-hidden="true"
              >
                {cappedUnread}
              </span>
            )}
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            id="help-updates-dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              closeRef.current?.focus();
            }}
            onCloseAutoFocus={() => {
              const pendingAction = pendingActionRef.current;
              pendingActionRef.current = null;
              if (pendingAction) window.requestAnimationFrame(pendingAction);
            }}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:inset-x-auto md:bottom-auto md:right-6 md:top-16 md:w-[380px]"
          >
            <header className="flex items-start gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-sm font-semibold">
                  Help & updates
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                  Questions, problem reports and product news.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="Close Help and updates"
                  className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </DialogPrimitive.Close>
            </header>

            <div className="space-y-3 overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => runAction(onAskQuestion)}
                  className="flex min-h-20 flex-col items-start justify-between rounded-md border border-primary/35 bg-primary/10 p-3 text-left hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MessageSquarePlus className="size-4 text-primary" aria-hidden="true" />
                  <span className="text-sm font-medium">Ask a question</span>
                </button>
                <button
                  type="button"
                  onClick={() => runAction(onReportProblem)}
                  className="flex min-h-20 flex-col items-start justify-between rounded-md border border-border p-3 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Bug className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium">Report a problem</span>
                </button>
              </div>

              <div className="overflow-hidden rounded-md border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Megaphone className="size-3.5" aria-hidden="true" />
                    What&apos;s new
                  </div>
                  {announcements.some((announcement) => !announcement.readAt) && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      New updates
                    </span>
                  )}
                </div>
                {visibleAnnouncements.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {visibleAnnouncements.map((announcement) => {
                      const isRead = Boolean(announcement.readAt);
                      return (
                        <li key={announcement.id} className="px-3 py-2.5">
                          <div className="flex items-start gap-2">
                            <span
                              className={cn(
                                "mt-1.5 size-2 shrink-0 rounded-full",
                                isRead ? "bg-muted-foreground/35" : "bg-primary",
                              )}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {ANNOUNCEMENT_LABEL[announcement.kind]}
                              </div>
                              <div className="mt-0.5 text-sm font-medium">{announcement.title}</div>
                              {announcement.body && (
                                <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                                  {announcement.body}
                                </p>
                              )}
                              <AnnouncementAttachments
                                attachments={announcement.attachments}
                                compact
                                className="mt-2"
                              />
                              <button
                                type="button"
                                aria-disabled={isRead}
                                onClick={() => {
                                  if (isRead) return;
                                  setPinnedAnnouncementId(announcement.id);
                                  void onMarkAnnouncementRead(announcement.id);
                                }}
                                className={cn(
                                  "mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  isRead
                                    ? "cursor-default text-muted-foreground"
                                    : "text-primary hover:underline",
                                )}
                              >
                                {isRead ? (
                                  <>
                                    <Check className="size-3" aria-hidden="true" /> Seen
                                  </>
                                ) : (
                                  "Mark as read"
                                )}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : announcementsPending ? (
                  <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                    Loading product updates…
                  </div>
                ) : announcementsError ? (
                  <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                    Product updates are unavailable. Try again later.
                  </div>
                ) : (
                  <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                    You&apos;re up to date. New releases will appear here.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => runAction(onOpenMessages)}
                className="flex min-h-11 w-full items-center justify-between rounded-md border border-border px-3 text-sm font-medium hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>Open your messages</span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {introVisible && showIntro && !open && (
        <div
          role="status"
          className="fixed right-3 top-[4.25rem] z-30 w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-primary/40 bg-popover p-3 shadow-xl lg:absolute lg:right-0 lg:top-full lg:mt-2"
        >
          <button
            type="button"
            onClick={rememberIntro}
            aria-label="Dismiss Help and updates introduction"
            className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
          <div className="pr-7">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              New
            </div>
            <div className="mt-1 text-sm font-medium">Help and product news now live here</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ask a question, report a problem and see new releases from any page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
