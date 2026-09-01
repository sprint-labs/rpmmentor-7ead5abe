// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FollowUp } from "@/lib/events/follow-up";
import type { NotifiableEvent } from "@/lib/events/notification-copy";
import { FollowUpActionLink, followUpDetail } from "./follow-up-status";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

afterEach(cleanup);

const event: NotifiableEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Northbridge v Riverside",
  eventType: "Match",
  eventDate: "2026-08-20",
  startTime: "15:00",
  goalkeeperName: "Demo Keeper",
  playerId: "22222222-2222-4222-8222-222222222222",
  participationStatus: "not_confirmed",
};

const confirmation: FollowUp = {
  kind: null,
  participationStatus: "not_confirmed",
  waived: false,
  status: "confirmation_needed",
  endsAtMs: Date.parse("2026-08-20T14:00:00Z"),
  deadlineMs: Date.parse("2026-08-22T14:00:00Z"),
  completedRecordId: null,
};

describe("FollowUpActionLink participation permissions", () => {
  it("does not give a mentor a dead-end participation confirmation action", () => {
    render(<FollowUpActionLink event={event} followUp={confirmation} />);
    expect(screen.queryByRole("link", { name: "Confirm participation" })).toBeNull();
  });

  it("keeps confirmation available to managers alongside the inline control", () => {
    render(<FollowUpActionLink event={event} followUp={confirmation} canConfirmParticipation />);
    expect(screen.getByRole("link", { name: "Confirm participation" })).toBeTruthy();

    const route = readFileSync(resolve(process.cwd(), "src/routes/follow-ups.tsx"), "utf8");
    expect(route).toContain('data?.canManage && row.eventType === "Match"');
    expect(route).toContain("canConfirmParticipation={Boolean(data?.canManage)}");
  });
});

describe("manager waiver presentation", () => {
  const didNotPlay: FollowUp = {
    ...confirmation,
    participationStatus: "did_not_play",
    status: "not_required",
  };

  it("does not describe participation-derived Not required as a manager waiver", () => {
    expect(followUpDetail(didNotPlay, "", "")).toBe("Did not play — no Match Report required");
  });

  it("keeps a real manager waiver distinct even when the goalkeeper did not play", () => {
    expect(followUpDetail({ ...didNotPlay, waived: true }, "Covered in person", "")).toBe(
      "Waived — Covered in person",
    );
  });

  it("drives the calendar editor action from the waiver fact, not Not required status", () => {
    const route = readFileSync(resolve(process.cwd(), "src/routes/calendar.tsx"), "utf8");
    expect(route).toContain("const waived = row.followUp.waived;");
    expect(route).not.toContain('const waived = row.followUp.status === "not_required";');
    expect(route).toContain("const canWaive = row.followUp.kind !== null;");
  });
});
