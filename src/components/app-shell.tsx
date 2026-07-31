import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserCog, MessageSquare, FileText, FolderOpen, BellRing, Calendar, BarChart3, LogOut, ShieldCheck, History, Check, Trash2, X, Menu, KeyRound, Sun, Moon, Plug, Database } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_LABEL, type Permission, type Role } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/lib/notifications";
import { formatRelative } from "@/lib/mock-data";
import { BrandMark } from "@/components/brand-mark";
import { OfflineBanner } from "@/components/offline-banner";
import { SyncManager } from "@/components/sync-manager";
import { InstallPrompt } from "@/components/install-prompt";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm: Permission };
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true, perm: "goalkeepers.view" },
  { to: "/goalkeepers", label: "Goalkeepers", icon: Users, perm: "goalkeepers.view" },
  { to: "/mentors", label: "Mentors", icon: UserCog, perm: "mentors.view" },
  { to: "/interactions", label: "Interactions Log", icon: MessageSquare, perm: "interactions.view" },
  { to: "/reports", label: "Match Reports", icon: FileText, perm: "reports.view" },
  
  { to: "/media", label: "Media Library", icon: FolderOpen, perm: "media.view" },
  { to: "/audit", label: "Audit Log", icon: History, perm: "audit.view" },
  { to: "/alerts", label: "Notification Centre", icon: BellRing, perm: "alerts.view" },
  { to: "/calendar", label: "Calendar", icon: Calendar, perm: "calendar.view" },
  { to: "/executive", label: "Executive", icon: BarChart3, perm: "executive.view" },
  { to: "/system/users", label: "Users & Roles", icon: ShieldCheck, perm: "system.manage" },
  { to: "/system/permissions", label: "Permission Check", icon: ShieldCheck, perm: "system.manage" },
  { to: "/system/integrations", label: "Integrations", icon: Plug, perm: "system.manage" },
  { to: "/system/data-quality", label: "Data Quality", icon: Database, perm: "system.manage" },
];

export function AppShell() {
  const { user, can, signOut, setViewAsRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const notif = useNotifications();

  // Public routes that don't require auth
  const isPublic = path === "/login" || path === "/install";

  useEffect(() => {
    if (!user && !isPublic) {
      navigate({ to: "/login" as never, search: { next: path } as never, replace: true });
    }
  }, [user, isPublic, navigate, path]);

  // Close drawer on route change
  useEffect(() => { setNavOpen(false); }, [path]);

  if (isPublic) return <Outlet />;
  if (!user) return <div className="min-h-screen bg-background" />;

  // Role-gated visible nav
  const visible = NAV.filter((n) => can(n.perm));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-16 md:h-14 flex items-center gap-2 md:gap-3 px-3 sm:px-4 md:px-6 border-b border-border bg-sidebar/95 backdrop-blur sticky top-0 z-10">
          <Link to="/" className="size-11 md:w-auto md:h-auto flex items-center justify-center md:justify-start gap-2.5 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <BrandMark className="size-9 shrink-0" alt="Mentor Hub" />
            <span className="hidden sm:inline font-semibold text-foreground tracking-tight">Mentor Hub</span>
          </Link>
          <div className="flex-1" />

          {user.actualRole === "super_admin" ? (
            <div className="hidden md:inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md bg-primary/10 border border-primary/30 text-primary text-[10px] font-medium uppercase tracking-wider" title="Interface only — server permissions are unchanged. This preview does not grant or restrict backend access.">
              <ShieldCheck className="size-3" />
              {user.role !== user.actualRole ? (
                <span className="hidden lg:inline">
                  Viewing as {ROLE_LABEL[user.role]}
                  <span className="mx-1.5 text-primary/60">·</span>
                  <span className="text-primary/80 normal-case tracking-normal">interface only</span>
                </span>
              ) : (
                <span>View as <span className="text-primary/70 normal-case tracking-normal">(interface only)</span></span>
              )}
              <select
                value={user.role}
                onChange={(e) => setViewAsRole(e.target.value as Role)}
                className="h-6 bg-transparent text-primary text-[10px] font-medium uppercase tracking-wider focus:outline-none cursor-pointer"
              >
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="mentor_manager">Mentor Manager</option>
                <option value="mentor">Mentor</option>
              </select>
              {user.role !== user.actualRole && (
                <button
                  onClick={() => setViewAsRole(null)}
                  title="Exit view as and return to Super Admin"
                  className="ml-1 inline-flex items-center gap-1 h-5 pl-1.5 pr-2 rounded bg-primary text-primary-foreground hover:opacity-90"
                >
                  <X className="size-3" />
                  <span>Exit view as</span>
                </button>
              )}
            </div>
          ) : (
            <div className="hidden md:inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-primary/10 border border-primary/30 text-primary text-[10px] font-medium uppercase tracking-wider"><ShieldCheck className="size-3" />{ROLE_LABEL[user.role]}</div>
          )}
          <ThemeToggle />
          {can("alerts.view") && (
            <div ref={bellRef} className="relative">
              <button onClick={() => setBellOpen((v) => !v)} className="relative size-11 md:size-9 grid place-items-center rounded-md border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <BellRing className="size-4" />
                {notif.unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-mono font-semibold grid place-items-center">
                    {notif.unread > 9 ? "9+" : notif.unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setBellOpen(false)} />
                  <div className="fixed inset-x-3 top-16 z-30 w-auto rounded-md border border-border bg-popover shadow-xl overflow-hidden md:absolute md:inset-x-auto md:top-auto md:right-0 md:mt-2 md:w-[360px]">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duty Notifications</div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => notif.markAllRead()} title="Mark all read" className="size-11 grid place-items-center rounded hover:bg-accent text-muted-foreground"><Check className="size-3.5" /></button>
                        <button onClick={() => notif.clearAll()} title="Clear" className="size-11 grid place-items-center rounded hover:bg-accent text-muted-foreground"><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto">
                      {notif.items.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs text-muted-foreground">No duty status changes.</div>
                      ) : (
                        notif.items.slice(0, 30).map((n) => {
                          const tone = n.to === "overdue" ? "bg-destructive" : n.to === "due_soon" ? "bg-warning" : n.to === "up_to_date" ? "bg-success" : "bg-muted-foreground/50";
                          return (
                            <Link
                              key={n.id}
                              to="/goalkeepers/$gkId"
                              params={{ gkId: n.gkId }}
                              onClick={() => { notif.markRead(n.id); setBellOpen(false); }}
                              className={cn("flex gap-2.5 px-3 py-2.5 border-b border-border/60 last:border-0 hover:bg-accent/40", !n.read && "bg-accent/20")}
                            >
                              <span className={cn("mt-1.5 size-2 rounded-full shrink-0", tone)} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{n.gkName}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  Duty moved <span className="uppercase">{n.from}</span> → <span className="uppercase font-medium text-foreground/80">{n.to}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{formatRelative(n.date)}</div>
                              </div>
                              {!n.read && <span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />}
                            </Link>
                          );
                        })
                      )}
                    </div>
                    <Link to="/alerts" onClick={() => setBellOpen(false)} className="block px-3 py-2 border-t border-border text-center text-xs text-primary hover:bg-accent/40">
                      Open alerts & email settings →
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setNavOpen(true)}
            title="Open menu"
            aria-label="Open menu"
            className="inline-flex size-11 md:w-auto md:h-9 md:px-3 items-center justify-center gap-1.5 rounded-md border border-border text-xs uppercase tracking-[0.06em] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Menu className="size-4" />
            <span className="hidden md:inline">Menu</span>
          </button>
        </header>
        <main className="flex-1 min-w-0 p-4 md:p-6">
          <OfflineBanner />
          <SyncManager />
          <Outlet />
        </main>
        <InstallPrompt />
      </div>

      {/* Slide-out navigation drawer */}
      {navOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 w-[min(22rem,calc(100vw-1rem))] md:w-72 flex flex-col border-l border-sidebar-border bg-sidebar shadow-2xl">
            <div className="flex items-center gap-2.5 px-4 min-h-16 md:h-14 border-b border-sidebar-border">
              <BrandMark className="size-7 shrink-0" alt="Mentor Hub" />
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <span className="text-sm font-semibold tracking-tight truncate">{user.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{ROLE_LABEL[user.role]}</span>
              </div>
              <button
                onClick={() => setNavOpen(false)}
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
              <Link
                to={"/account" as never}
                onClick={() => setNavOpen(false)}
                className="w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs uppercase tracking-[0.06em] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <KeyRound className="size-4" />Account
              </Link>
              <button
                onClick={() => { signOut(); setNavOpen(false); navigate({ to: "/login" as never }); }}
                className="w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs uppercase tracking-[0.06em] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" />Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="size-11 md:size-9 grid place-items-center rounded-md border border-border hover:bg-accent text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
