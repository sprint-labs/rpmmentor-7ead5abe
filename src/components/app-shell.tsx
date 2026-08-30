import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserCog,
  MessageSquare,
  FileText,
  FolderOpen,
  BellRing,
  Calendar,
  ClipboardCheck,
  BarChart3,
  Plus,
  LogOut,
  ShieldCheck,
  History,
  Check,
  Trash2,
  X,
  Menu,
  KeyRound,
  Sun,
  Moon,
  Plug,
  Database,
  LifeBuoy,
  Columns3,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_LABEL, type Permission, type Role } from "@/lib/auth";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { useNotifications } from "@/lib/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNotifications, markNotificationsRead } from "@/lib/events/notifications.functions";
import { notificationsQueryKey } from "@/lib/events/query-keys";
import { formatRelative } from "@/lib/mock-data";
import { visibleNotificationUnreadCount } from "@/lib/notification-visibility";
import { listActiveAnnouncements, markAnnouncementRead } from "@/lib/support.functions";
import {
  isAnnouncementBannerVisible,
  isAnnouncementInBell,
} from "@/lib/support/announcement-visibility";
import { BrandMark } from "@/components/brand-mark";
import { OfflineBanner } from "@/components/offline-banner";
import { SyncManager } from "@/components/sync-manager";
import { InstallPrompt } from "@/components/install-prompt";
import { MaintenanceScreen } from "@/components/maintenance-screen";
import { HelpUpdatesLauncher } from "@/components/help-updates-launcher";
import { isRestrictedDuringMaintenance } from "@/lib/maintenance";
import { isPublicRoute } from "@/lib/public-routes";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  perm: Permission;
};
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true, perm: "goalkeepers.view" },
  { to: "/bulletins", label: "Bulletin Board", icon: Columns3, perm: "bulletins.view" },
  { to: "/goalkeepers", label: "Goalkeepers", icon: Users, perm: "goalkeepers.view" },
  { to: "/system/players", label: "Player Records", icon: Database, perm: "players.edit_club" },
  { to: "/mentors", label: "Users & Roles", icon: UserCog, perm: "mentors.view" },
  {
    to: "/interactions",
    label: "Interactions Log",
    icon: MessageSquare,
    perm: "interactions.view",
  },
  { to: "/reports", label: "Match Reports", icon: FileText, perm: "reports.view" },

  { to: "/media", label: "Media Library", icon: FolderOpen, perm: "media.view" },
  { to: "/audit", label: "Audit Log", icon: History, perm: "audit.view" },
  { to: "/alerts", label: "Notification Centre", icon: BellRing, perm: "alerts.view" },
  { to: "/calendar", label: "Calendar", icon: Calendar, perm: "calendar.view" },
  { to: "/follow-ups", label: "Follow-ups", icon: ClipboardCheck, perm: "calendar.view" },
  { to: "/support", label: "Help & Messages", icon: LifeBuoy, perm: "support.send" },
  { to: "/executive", label: "Executive", icon: BarChart3, perm: "executive.view" },
  { to: "/system/users", label: "Manage Users", icon: ShieldCheck, perm: "system.manage" },
  {
    to: "/system/permissions",
    label: "Permission Check",
    icon: ShieldCheck,
    perm: "system.manage",
  },
  { to: "/system/integrations", label: "Integrations", icon: Plug, perm: "system.manage" },
  { to: "/system/data-quality", label: "Data Quality", icon: Database, perm: "system.manage" },
  {
    to: "/system/sync-verification",
    label: "Sync Verification",
    icon: ShieldCheck,
    perm: "system.manage",
  },
];

export function AppShell() {
  const { user, loading, can, signOut, setViewAsRole, passwordRecoveryPending } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const menuDialogRef = useRef<HTMLElement>(null);
  const wasMenuOpenRef = useRef(false);
  const notif = useNotifications();

  /**
   * The durable inbox. Available to every role that can see the calendar, not
   * only to the alerts-view roles: an assigned mentor is exactly who needs to be
   * told about a new event or a write-up that has gone past its deadline.
   */
  const canSeeEventInbox = can("calendar.view");
  const canSeeDutyNotifications = can("alerts.view");
  const canSeeSupport = can("support.send");
  const queryClient = useQueryClient();
  const fetchInbox = useServerFn(listNotifications);
  const markInboxRead = useServerFn(markNotificationsRead);
  const fetchAnnouncements = useServerFn(listActiveAnnouncements);
  const markAnnouncementSeen = useServerFn(markAnnouncementRead);
  const notificationQueryKey = notificationsQueryKey(user?.id ?? "anonymous");
  const announcementQueryKey = ["announcements", "active", user?.id ?? "anonymous"] as const;
  const {
    data: inbox,
    isPending: inboxPending,
    isError: inboxError,
  } = useQuery({
    queryKey: notificationQueryKey,
    queryFn: () => fetchInbox(),
    staleTime: 60_000,
    enabled: canSeeEventInbox,
  });
  const {
    data: announcements = [],
    isPending: announcementsPending,
    isError: announcementsError,
  } = useQuery({
    queryKey: announcementQueryKey,
    queryFn: () => fetchAnnouncements(),
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: canSeeSupport,
  });
  const inboxItems = inbox?.items ?? [];
  const inboxUnread = inboxItems.filter((item) => !item.readAt).length;
  const updateAnnouncements = announcements.filter(
    (announcement) => announcement.kind === "feature" || announcement.kind === "info",
  );
  const bellAnnouncements = announcements.filter(
    (announcement) =>
      (announcement.kind === "incident" || announcement.kind === "downtime") &&
      isAnnouncementInBell(announcement),
  );
  const bannerAnnouncements = announcements.filter((a) => isAnnouncementBannerVisible(a));
  const bellAnnouncementUnread = bellAnnouncements.length;
  const helpUnread = updateAnnouncements.filter((announcement) => !announcement.readAt).length;
  const bellUnread = visibleNotificationUnreadCount(
    inboxUnread,
    notif.unread,
    canSeeDutyNotifications,
    bellAnnouncementUnread,
  );

  async function markInboxAllRead() {
    try {
      await markInboxRead({ data: { ids: [] } });
      await queryClient.invalidateQueries({ queryKey: notificationQueryKey });
    } catch {
      // Nothing to recover: the inbox simply stays unread until the next attempt.
    }
  }

  async function markAnnouncementAsRead(announcementId: string) {
    try {
      await markAnnouncementSeen({ data: { announcementId } });
      await queryClient.invalidateQueries({ queryKey: announcementQueryKey });
    } catch {
      // Keep the item unread so the user can try again later.
    }
  }

  // Public routes must remain available without auth. Password recovery must
  // also remain reachable while maintenance mode is enabled.
  const isPublic = isPublicRoute(path);

  useEffect(() => {
    if (!loading && passwordRecoveryPending && path !== "/reset-password") {
      navigate({ to: "/reset-password", replace: true });
    }
  }, [loading, passwordRecoveryPending, path, navigate]);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      navigate({ to: "/login" as never, search: { next: path } as never, replace: true });
    }
  }, [loading, user, isPublic, navigate, path]);

  // Close drawer on route change
  useEffect(() => {
    setNavOpen(false);
    setHelpOpen(false);
  }, [path]);

  useEffect(() => {
    if (navOpen) {
      requestAnimationFrame(() => menuCloseRef.current?.focus());
    } else if (wasMenuOpenRef.current) {
      menuTriggerRef.current?.focus();
    }
    wasMenuOpenRef.current = navOpen;
  }, [navOpen]);

  function closeMenu() {
    setNavOpen(false);
  }

  function trapMenuFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== "Tab" || !menuDialogRef.current) return;

    const focusable = Array.from(
      menuDialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("hidden"));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (loading)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen bg-background"
        aria-busy="true"
      />
    );
  if (!user)
    return isPublic ? (
      <Outlet />
    ) : (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-background" />
    );
  if (!isPublic && isRestrictedDuringMaintenance(user)) {
    return (
      <MaintenanceScreen
        onSignOut={async () => {
          await signOut();
          navigate({ to: "/login" as never, replace: true });
        }}
      />
    );
  }
  if (isPublic) return <Outlet />;

  // Role-gated visible nav
  const visible = NAV.filter((n) => can(n.perm));

  // Pick a primary CTA per role
  const canLog = can("interactions.log");
  const primaryAction: { kind: WorkflowKind; label: string } | null = canLog
    ? { kind: "interaction", label: "Log Interaction" }
    : can("reports.submit")
      ? { kind: "report", label: "Submit Report" }
      : can("goalkeepers.create")
        ? { kind: "goalkeeper", label: "Add Goalkeeper" }
        : null;

  return (
    <div className="flex min-h-screen overflow-x-clip bg-background text-foreground supports-[height:100dvh]:min-h-dvh">
      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-16 md:h-14 flex items-center gap-1.5 sm:gap-2 md:gap-3 px-3 sm:px-4 md:px-6 border-b border-border bg-sidebar/95 backdrop-blur sticky top-0 z-10">
          <Link
            to="/"
            aria-label="Mentor Hub"
            className="size-11 md:w-auto md:h-auto flex items-center justify-center md:justify-start gap-2.5 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <BrandMark className="size-9 shrink-0" alt="" />
            <span
              className="hidden sm:inline font-semibold text-foreground tracking-tight"
              aria-hidden="true"
            >
              Mentor Hub
            </span>
          </Link>
          <div className="flex-1" />

          {user.actualRole === "super_admin" || user.actualRole === "mentor_manager" ? (
            <div
              className="hidden md:inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md bg-primary/10 border border-primary/30 text-primary text-[10px] font-medium uppercase tracking-wider"
              title="Interface only — server permissions are unchanged. This preview does not grant or restrict backend access."
            >
              <ShieldCheck className="size-3" />
              {user.role !== user.actualRole ? (
                <span className="hidden lg:inline">
                  Viewing as {ROLE_LABEL[user.role]}
                  <span className="mx-1.5 text-primary/60">·</span>
                  <span className="text-primary/80 normal-case tracking-normal">
                    interface only
                  </span>
                </span>
              ) : (
                <span>
                  View as{" "}
                  <span className="text-primary/70 normal-case tracking-normal">
                    (interface only)
                  </span>
                </span>
              )}
              <label htmlFor="view-as-role" className="sr-only">
                View interface as role
              </label>
              <select
                id="view-as-role"
                value={user.role}
                onChange={(e) => setViewAsRole(e.target.value as Role)}
                className="h-6 bg-transparent text-primary text-[10px] font-medium uppercase tracking-wider focus:outline-none cursor-pointer"
              >
                {user.actualRole === "super_admin" ? (
                  <>
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin</option>
                    <option value="mentor_manager">Mentor Manager</option>
                    <option value="mentor">Mentor</option>
                  </>
                ) : (
                  <>
                    <option value="mentor_manager">Mentor Manager</option>
                    <option value="mentor">Mentor</option>
                  </>
                )}
              </select>
              {user.role !== user.actualRole && (
                <button
                  onClick={() => setViewAsRole(null)}
                  title={
                    user.actualRole === "super_admin"
                      ? "Exit view as and return to Super Admin"
                      : "Exit view as and return to Mentor Manager"
                  }
                  className="ml-1 inline-flex items-center gap-1 h-5 pl-1.5 pr-2 rounded bg-primary text-primary-foreground hover:opacity-90"
                >
                  <X className="size-3" />
                  <span>Exit view as</span>
                </button>
              )}
            </div>
          ) : (
            <div className="hidden md:inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-primary/10 border border-primary/30 text-primary text-[10px] font-medium uppercase tracking-wider">
              <ShieldCheck className="size-3" />
              {ROLE_LABEL[user.role]}
            </div>
          )}
          <ThemeToggle className="hidden sm:grid" />
          {(canSeeDutyNotifications || canSeeEventInbox || canSeeSupport) && (
            <div ref={bellRef} className="relative shrink-0">
              <button
                onClick={() => {
                  setHelpOpen(false);
                  setBellOpen((v) => !v);
                }}
                aria-label={
                  bellUnread > 0
                    ? `${bellOpen ? "Close" : "Open"} notifications, ${bellUnread > 9 ? "9+" : bellUnread} unread`
                    : bellOpen
                      ? "Close notifications"
                      : "Open notifications"
                }
                aria-expanded={bellOpen}
                aria-controls="duty-notifications"
                className="relative size-11 shrink-0 md:size-9 grid place-items-center rounded-md border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <BellRing className="size-4" aria-hidden="true" />
                {bellUnread > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-mono font-semibold grid place-items-center"
                    aria-hidden="true"
                  >
                    {bellUnread > 9 ? "9+" : bellUnread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setBellOpen(false)} />
                  <div
                    id="duty-notifications"
                    role="region"
                    aria-label="Notifications"
                    className="fixed inset-x-3 top-16 z-30 w-auto rounded-md border border-border bg-popover shadow-xl overflow-hidden md:absolute md:inset-x-auto md:top-auto md:right-0 md:mt-2 md:w-[360px]"
                  >
                    {/* Event notifications come from the database, so they are the
                        same on every device and survive signing out. */}
                    {canSeeEventInbox && (
                      <div className="border-b border-border">
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Notifications
                          </div>
                          {inboxUnread > 0 && (
                            <button
                              onClick={() => void markInboxAllRead()}
                              title="Mark all read"
                              className="size-11 grid place-items-center rounded hover:bg-accent text-muted-foreground"
                            >
                              <Check className="size-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="max-h-[260px] overflow-y-auto">
                          {inboxPending && inboxItems.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              Loading notifications…
                            </div>
                          ) : inboxError && inboxItems.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              Notifications unavailable.
                            </div>
                          ) : inboxItems.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              Nothing about your scheduled events yet.
                            </div>
                          ) : (
                            inboxItems.map((n) => (
                              <Link
                                key={n.id}
                                to={n.linkPath.split("?")[0] || "/calendar"}
                                search={Object.fromEntries(
                                  new URLSearchParams(n.linkPath.split("?")[1] ?? ""),
                                )}
                                onClick={() => {
                                  void markInboxRead({ data: { ids: [n.id] } }).then(() =>
                                    queryClient.invalidateQueries({
                                      queryKey: notificationQueryKey,
                                    }),
                                  );
                                  setBellOpen(false);
                                }}
                                className={cn(
                                  "block px-3 py-2.5 border-b border-border/60 last:border-0 hover:bg-accent/40",
                                  !n.readAt && "bg-accent/20",
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <span
                                    className={cn(
                                      "mt-1.5 size-2 rounded-full shrink-0",
                                      n.kind === "follow_up_overdue"
                                        ? "bg-destructive"
                                        : n.kind === "event_cancelled"
                                          ? "bg-muted-foreground/50"
                                          : n.kind === "support_thread_opened" ||
                                              n.kind === "support_reply"
                                            ? "bg-sky-500"
                                            : "bg-primary",
                                    )}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium">{n.title}</div>
                                    <div className="mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground">
                                      {n.body}
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                    {canSeeSupport && (
                      <div className="border-b border-border">
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Service updates
                        </div>
                        <div className="max-h-[200px] overflow-y-auto">
                          {bellAnnouncements.length > 0 ? (
                            bellAnnouncements.map((a) => (
                              <div
                                key={a.id}
                                className="flex items-start gap-2 px-3 py-2.5 border-b border-border/60 last:border-0 bg-accent/20"
                              >
                                <span
                                  className={cn(
                                    "mt-1.5 size-2 rounded-full shrink-0",
                                    a.kind === "incident" || a.kind === "downtime"
                                      ? "bg-destructive"
                                      : "bg-primary",
                                  )}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium">{a.title}</div>
                                  {a.body && (
                                    <div className="mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground">
                                      {a.body}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    className="mt-1 text-[11px] text-primary hover:underline"
                                    onClick={() => void markAnnouncementAsRead(a.id)}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : announcementsPending ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              Loading service updates…
                            </div>
                          ) : announcementsError ? (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              Service updates unavailable.
                            </div>
                          ) : (
                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                              No unread service updates.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {canSeeDutyNotifications && (
                      <>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Duty Notifications
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => notif.markAllRead()}
                              title="Mark all read"
                              className="size-11 grid place-items-center rounded hover:bg-accent text-muted-foreground"
                            >
                              <Check className="size-3.5" />
                            </button>
                            <button
                              onClick={() => notif.clearAll()}
                              title="Clear"
                              className="size-11 grid place-items-center rounded hover:bg-accent text-muted-foreground"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="max-h-[420px] overflow-y-auto">
                          {notif.items.length === 0 ? (
                            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                              No duty status changes.
                            </div>
                          ) : (
                            notif.items.map((n) => {
                              const tone =
                                n.to === "overdue"
                                  ? "bg-destructive"
                                  : n.to === "due_soon"
                                    ? "bg-warning"
                                    : n.to === "up_to_date"
                                      ? "bg-success"
                                      : "bg-muted-foreground/50";
                              return (
                                <Link
                                  key={n.id}
                                  to="/goalkeepers/$gkId"
                                  params={{ gkId: n.gkId }}
                                  onClick={() => {
                                    notif.markRead(n.id);
                                    setBellOpen(false);
                                  }}
                                  className={cn(
                                    "flex gap-2.5 px-3 py-2.5 border-b border-border/60 last:border-0 hover:bg-accent/40",
                                    !n.read && "bg-accent/20",
                                  )}
                                >
                                  <span
                                    className={cn("mt-1.5 size-2 rounded-full shrink-0", tone)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{n.gkName}</div>
                                    <div className="text-[11px] text-muted-foreground">
                                      Duty moved <span className="uppercase">{n.from}</span> →{" "}
                                      <span className="uppercase font-medium text-foreground/80">
                                        {n.to}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {formatRelative(n.date)}
                                    </div>
                                  </div>
                                  {!n.read && (
                                    <span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />
                                  )}
                                </Link>
                              );
                            })
                          )}
                        </div>
                        <Link
                          to="/alerts"
                          onClick={() => setBellOpen(false)}
                          className="block px-3 py-2 border-t border-border text-center text-xs text-primary hover:bg-accent/40"
                        >
                          Open alerts & email settings →
                        </Link>
                      </>
                    )}
                    {canSeeEventInbox && (
                      <Link
                        to="/follow-ups"
                        onClick={() => setBellOpen(false)}
                        className="block px-3 py-2 border-t border-border text-center text-xs text-primary hover:bg-accent/40"
                      >
                        Open follow-ups →
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {canSeeSupport && (
            <HelpUpdatesLauncher
              open={helpOpen}
              unreadCount={helpUnread}
              announcements={updateAnnouncements}
              announcementsPending={announcementsPending}
              announcementsError={announcementsError}
              introVisible={!bellOpen && !navOpen}
              onOpenChange={(next) => {
                if (next) setBellOpen(false);
                setHelpOpen(next);
              }}
              onAskQuestion={() => setWorkflow("question")}
              onReportProblem={() => setWorkflow("bug")}
              onOpenMessages={() => navigate({ to: "/support" as never })}
              onMarkAnnouncementRead={markAnnouncementAsRead}
            />
          )}
          {canLog && (
            <button
              onClick={() => setWorkflow("interaction")}
              title="Log Interaction"
              aria-label="Log Interaction"
              className="md:hidden inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="size-4" />
            </button>
          )}
          <button
            ref={menuTriggerRef}
            onClick={() => {
              setBellOpen(false);
              setHelpOpen(false);
              setNavOpen(true);
            }}
            title="Open menu"
            aria-label="Open menu"
            aria-expanded={navOpen}
            aria-controls="main-navigation"
            className="inline-flex size-11 shrink-0 md:w-auto md:h-9 md:px-3 items-center justify-center gap-1.5 rounded-md border border-border text-xs uppercase tracking-[0.06em] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Menu className="size-4" />
            <span className="hidden md:inline">Menu</span>
          </button>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-4 md:p-6">
          {bannerAnnouncements.map((a) => (
            <div
              key={a.id}
              role="status"
              className="mb-3 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/15 px-3 py-2.5 text-sm"
            >
              <span className="mt-0.5 size-2 shrink-0 rounded-full bg-destructive" />
              <div>
                <div className="font-medium text-destructive">
                  {a.kind === "downtime" ? "Downtime" : "Incident"}: {a.title}
                </div>
                {a.body && (
                  <div className="mt-0.5 text-xs text-foreground/80 whitespace-pre-wrap">
                    {a.body}
                  </div>
                )}
              </div>
            </div>
          ))}
          <OfflineBanner />
          <SyncManager />
          <Outlet />
        </main>
        <InstallPrompt />
      </div>

      {/* Slide-out navigation drawer */}
      {navOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
            onClick={closeMenu}
          />
          <aside
            ref={menuDialogRef}
            id="main-navigation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
            onKeyDown={trapMenuFocus}
            className="fixed inset-y-0 right-0 z-50 w-[min(22rem,calc(100vw-1rem))] md:w-72 flex flex-col border-l border-sidebar-border bg-sidebar shadow-2xl"
          >
            <div className="flex items-center gap-2.5 px-4 min-h-16 md:h-14 border-b border-sidebar-border">
              <BrandMark className="size-7 shrink-0" alt="Mentor Hub" />
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <h2 id="menu-title" className="text-sm font-semibold tracking-tight truncate">
                  {user.name}
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
              <button
                ref={menuCloseRef}
                onClick={closeMenu}
                aria-label="Close menu"
                className="size-11 md:size-8 grid place-items-center rounded-md hover:bg-sidebar-accent/60 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 md:p-2 space-y-1 md:space-y-0.5 overflow-y-auto">
              {visible.map((n) => {
                const active = n.exact ? path === n.to : path.startsWith(n.to);
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to as never}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 px-3 py-2 rounded-[6px] text-[13px] md:text-[12.5px] font-semibold uppercase tracking-[0.05em] transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-sidebar-border space-y-2">
              {primaryAction &&
                primaryAction.kind !== "interaction" &&
                primaryAction.kind !== "report" && (
                  <button
                    onClick={() => {
                      setWorkflow(primaryAction.kind);
                      setNavOpen(false);
                    }}
                    className="w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs uppercase tracking-[0.06em] font-semibold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-4" />
                    {primaryAction.label}
                  </button>
                )}
              <ThemeToggle menu />
              <Link
                to={"/account" as never}
                onClick={closeMenu}
                className="w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs uppercase tracking-[0.06em] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <KeyRound className="size-4" />
                Account
              </Link>
              <button
                onClick={() => {
                  signOut();
                  setNavOpen(false);
                  navigate({ to: "/login" as never });
                }}
                className="w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs uppercase tracking-[0.06em] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}

      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} prefillPagePath={path} />
    </div>
  );
}

function ThemeToggle({ className, menu = false }: { className?: string; menu?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        menu
          ? "flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] hover:bg-accent sm:hidden"
          : "size-11 shrink-0 place-items-center rounded-md border border-border text-foreground/80 hover:bg-accent md:size-9",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {menu && <span>{isDark ? "Light appearance" : "Dark appearance"}</span>}
    </button>
  );
}
