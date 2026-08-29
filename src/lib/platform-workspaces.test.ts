import { describe, expect, it } from "vitest";

import {
  PLATFORM_WORKSPACES,
  currentPlatformWorkspace,
  visiblePlatformWorkspaces,
} from "./platform-workspaces";

describe("platform workspaces", () => {
  it("uses the real Scouting Hub player-search entry point without carrying private criteria", () => {
    const scouting = PLATFORM_WORKSPACES.find((workspace) => workspace.key === "scouting");

    expect(scouting).toMatchObject({
      href: "https://gkhq.app/goalkeepers",
      external: true,
    });
    expect(scouting?.href).not.toContain("?");
  });

  it("only exposes Bulletin to roles that can view it", () => {
    expect(visiblePlatformWorkspaces(false).map((workspace) => workspace.key)).toEqual([
      "mentor",
      "scouting",
    ]);
    expect(visiblePlatformWorkspaces(true).map((workspace) => workspace.key)).toEqual([
      "mentor",
      "scouting",
      "bulletin",
    ]);
  });

  it("marks Bulletin routes as the Bulletin workspace", () => {
    expect(currentPlatformWorkspace("/bulletins")).toBe("bulletin");
    expect(currentPlatformWorkspace("/bulletins/example")).toBe("bulletin");
    expect(currentPlatformWorkspace("/goalkeepers")).toBe("mentor");
  });
});
