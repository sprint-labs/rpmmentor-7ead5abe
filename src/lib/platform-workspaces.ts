export type PlatformWorkspaceKey = "mentor" | "scouting" | "bulletin";

export type PlatformWorkspace = {
  key: PlatformWorkspaceKey;
  label: string;
  description: string;
  href: string;
  external: boolean;
  requiresBulletins?: boolean;
};

export const PLATFORM_WORKSPACES = [
  {
    key: "mentor",
    label: "Mentor",
    description: "Relationships and duty of care",
    href: "/",
    external: false,
  },
  {
    key: "scouting",
    label: "Scouting",
    description: "Player search and recommendations",
    href: "https://gkhq.app/goalkeepers",
    external: true,
  },
  {
    key: "bulletin",
    label: "Bulletin",
    description: "Agency operations and next actions",
    href: "/bulletins",
    external: false,
    requiresBulletins: true,
  },
] as const satisfies readonly PlatformWorkspace[];

export function visiblePlatformWorkspaces(canViewBulletins: boolean): readonly PlatformWorkspace[] {
  return PLATFORM_WORKSPACES.filter(
    (workspace) => !workspace.requiresBulletins || canViewBulletins,
  );
}

export function currentPlatformWorkspace(path: string): PlatformWorkspaceKey {
  return path === "/bulletins" || path.startsWith("/bulletins/") ? "bulletin" : "mentor";
}
