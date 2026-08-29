import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Columns3, ExternalLink, UserSearch, Users } from "lucide-react";

import {
  currentPlatformWorkspace,
  visiblePlatformWorkspaces,
  type PlatformWorkspaceKey,
} from "@/lib/platform-workspaces";
import { cn } from "@/lib/utils";

const WORKSPACE_ICONS = {
  mentor: Users,
  scouting: UserSearch,
  bulletin: Columns3,
} satisfies Record<PlatformWorkspaceKey, typeof Users>;

export function PlatformWorkspaceNavigation({
  path,
  canViewBulletins,
  onNavigate,
}: {
  path: string;
  canViewBulletins: boolean;
  onNavigate: () => void;
}) {
  const current = currentPlatformWorkspace(path);

  return (
    <section
      className="border-b border-sidebar-border px-3 py-3"
      aria-labelledby="workspace-nav-title"
    >
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <div>
          <div
            id="workspace-nav-title"
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground"
          >
            GKHQ Platform
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Separate systems, one operational entry point
          </p>
        </div>
        <ArrowUpRight className="size-3.5 text-primary" aria-hidden="true" />
      </div>

      <div className="space-y-1">
        {visiblePlatformWorkspaces(canViewBulletins).map((workspace) => {
          const Icon = WORKSPACE_ICONS[workspace.key];
          const active = current === workspace.key;
          const classes = cn(
            "flex min-h-12 w-full items-center gap-2.5 rounded-[6px] border px-2.5 py-2 text-left transition-colors",
            active
              ? "border-primary/40 bg-primary/10 text-sidebar-foreground"
              : "border-sidebar-border text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          );
          const content = (
            <>
              <Icon
                className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.05em]">
                  {workspace.label}
                  {workspace.external && <ExternalLink className="size-3" aria-hidden="true" />}
                </span>
                <span className="block truncate text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                  {workspace.description}
                </span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                {active ? "Here" : workspace.external ? "Separate sign-in" : "Open"}
              </span>
            </>
          );

          return workspace.external ? (
            <a
              key={workspace.key}
              className={classes}
              href={workspace.href}
              rel="noreferrer noopener"
              target="_blank"
              aria-label={`${workspace.label}: ${workspace.description} (opens in a new tab with its own sign-in)`}
            >
              {content}
            </a>
          ) : (
            <Link
              key={workspace.key}
              className={classes}
              onClick={onNavigate}
              to={workspace.href as never}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
