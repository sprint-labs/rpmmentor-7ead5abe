// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Permission, Role } from "@/lib/auth";
import { resolveFollowUp, type FollowUp } from "@/lib/events/follow-up";
import type { NotifiableEvent } from "@/lib/events/notification-copy";
import { FollowUpActionLink } from "./follow-up-status";

const authState = vi.hoisted(() => ({ role: "mentor" as Role }));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      loading: false,
      can: (permission: Permission) => actual.roleHasPermission(authState.role, permission),
      signIn: vi.fn(),
      signOut: vi.fn(),
      setViewAsRole: vi.fn(),
    }),
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    search?: unknown;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const MATCH_EVENT: NotifiableEvent = {
  id: "evt-match",
  title: "Match vs Northern",
  eventType: "Match",
  eventDate: "2026-08-15",
  startTime: "15:00",
  goalkeeperName: "Alex Goalkeeper",
  playerId: "gk-1",
};

const VISIT_EVENT: NotifiableEvent = {
  ...MATCH_EVENT,
  id: "evt-visit",
  title: "Training Ground Visit",
  eventType: "Training Ground Visit",
};

function pendingMatch(): FollowUp {
  return resolveFollowUp(
    {
      eventType: "Match",
      eventDate: "2026-08-15",
      startTime: "15:00",
      cancelled: false,
      waived: false,
      completedRecordId: null,
    },
    Date.parse("2026-08-16T12:00:00+01:00"),
  );
}

function pendingVisit(): FollowUp {
  return resolveFollowUp(
    {
      eventType: "Training Ground Visit",
      eventDate: "2026-08-15",
      startTime: "15:00",
      cancelled: false,
      waived: false,
      completedRecordId: null,
    },
    Date.parse("2026-08-16T12:00:00+01:00"),
  );
}

afterEach(() => {
  cleanup();
  authState.role = "mentor";
});

describe("FollowUpActionLink", () => {
  it("hides submit and log links from an admin who cannot record", () => {
    authState.role = "admin";

    const { rerender } = render(
      <FollowUpActionLink event={MATCH_EVENT} followUp={pendingMatch()} />,
    );
    expect(screen.queryByRole("link", { name: /submit match report/i })).toBeNull();

    rerender(<FollowUpActionLink event={VISIT_EVENT} followUp={pendingVisit()} />);
    expect(screen.queryByRole("link", { name: /submit interaction/i })).toBeNull();
  });

  it("still offers a mentor the form that discharges the follow-up", () => {
    authState.role = "mentor";

    const { rerender } = render(
      <FollowUpActionLink event={MATCH_EVENT} followUp={pendingMatch()} />,
    );
    expect(screen.getByRole("link", { name: /submit match report/i }).getAttribute("href")).toBe(
      "/reports",
    );

    rerender(<FollowUpActionLink event={VISIT_EVENT} followUp={pendingVisit()} />);
    expect(screen.getByRole("link", { name: /submit interaction/i }).getAttribute("href")).toBe(
      "/interactions",
    );
  });
});
