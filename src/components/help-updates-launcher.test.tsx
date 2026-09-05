// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { AnnouncementRow } from "@/lib/support/schema";
import { HelpUpdatesLauncher } from "./help-updates-launcher";

afterEach(() => {
  cleanup();
});

function makeAnnouncement(index: number, readAt: string | null = null): AnnouncementRow {
  return {
    id: `0d84e8db-cb4e-4c1a-af46-5400193a6c${index.toString().padStart(2, "0")}`,
    kind: index % 2 === 0 ? "feature" : "info",
    title: `Product update ${index}`,
    body: `Release detail ${index}`,
    startsAt: "2026-08-26T12:00:00.000Z",
    endsAt: null,
    active: true,
    createdBy: "13cd4eca-982a-4c0a-80eb-62d0fc27ecb2",
    createdAt: `2026-08-26T12:0${index}:00.000Z`,
    readAt,
    attachment: null,
  };
}

const announcements = [makeAnnouncement(1)];

function LauncherHarness({
  onAskQuestion = vi.fn(),
  onReportProblem = vi.fn(),
  onOpenMessages = vi.fn(),
  onMarkAnnouncementRead = vi.fn(),
  items = announcements,
  unreadCount = 1,
  announcementsPending = false,
  announcementsError = false,
  introVisible = true,
}: Partial<{
  onAskQuestion: () => void;
  onReportProblem: () => void;
  onOpenMessages: () => void;
  onMarkAnnouncementRead: (announcementId: string) => void;
  items: AnnouncementRow[];
  unreadCount: number;
  announcementsPending: boolean;
  announcementsError: boolean;
  introVisible: boolean;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <HelpUpdatesLauncher
      open={open}
      unreadCount={unreadCount}
      announcements={items}
      announcementsPending={announcementsPending}
      announcementsError={announcementsError}
      introVisible={introVisible}
      onOpenChange={setOpen}
      onAskQuestion={onAskQuestion}
      onReportProblem={onReportProblem}
      onOpenMessages={onOpenMessages}
      onMarkAnnouncementRead={onMarkAnnouncementRead}
    />
  );
}

describe("HelpUpdatesLauncher", () => {
  it("introduces the new global location once and hides the hint behind competing surfaces", async () => {
    const { rerender } = render(<LauncherHarness introVisible={false} />);

    await waitFor(() => {
      expect(screen.queryByText("Help and product news now live here")).toBeNull();
    });

    rerender(<LauncherHarness introVisible />);
    expect(await screen.findByText("Help and product news now live here")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Help and updates introduction" }));
    expect(window.localStorage.getItem("rpm-help-updates-intro-v1")).toBe("seen");

    cleanup();
    render(<LauncherHarness />);
    await waitFor(() => {
      expect(screen.queryByText("Help and product news now live here")).toBeNull();
    });
  });

  it("surfaces support actions, messages and active product updates", async () => {
    const onAskQuestion = vi.fn();
    const onReportProblem = vi.fn();
    const onOpenMessages = vi.fn();
    const onMarkAnnouncementRead = vi.fn();
    render(
      <LauncherHarness
        onAskQuestion={onAskQuestion}
        onReportProblem={onReportProblem}
        onOpenMessages={onOpenMessages}
        onMarkAnnouncementRead={onMarkAnnouncementRead}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates, 1 new" }));

    expect(screen.getByRole("dialog", { name: "Help & updates" })).toBeTruthy();
    expect(screen.getByText("Product update 1")).toBeTruthy();
    expect(screen.getByText("Release detail 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    expect(onMarkAnnouncementRead).toHaveBeenCalledWith(announcements[0].id);

    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    await waitFor(() => expect(onAskQuestion).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Help & updates" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates, 1 new" }));
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    await waitFor(() => expect(onReportProblem).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates, 1 new" }));
    fireEvent.click(screen.getByRole("button", { name: "Open your messages" }));
    await waitFor(() => expect(onOpenMessages).toHaveBeenCalledTimes(1));
  });

  it("moves focus into the modal and restores it after Escape", async () => {
    render(<LauncherHarness />);
    const trigger = screen.getByRole("button", { name: "Open Help and updates, 1 new" });
    fireEvent.click(trigger);

    const close = screen.getByRole("button", { name: "Close Help and updates" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    fireEvent.keyDown(close, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Help & updates" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("hands focus to a workflow only after the Help modal has restored focus", async () => {
    function FocusHandoffHarness() {
      const [helpOpen, setHelpOpen] = useState(false);
      const [workflowOpen, setWorkflowOpen] = useState(false);
      return (
        <>
          <HelpUpdatesLauncher
            open={helpOpen}
            unreadCount={1}
            announcements={announcements}
            announcementsPending={false}
            announcementsError={false}
            onOpenChange={setHelpOpen}
            onAskQuestion={() => setWorkflowOpen(true)}
            onReportProblem={vi.fn()}
            onOpenMessages={vi.fn()}
            onMarkAnnouncementRead={vi.fn()}
          />
          <DialogPrimitive.Root open={workflowOpen} onOpenChange={setWorkflowOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay />
              <DialogPrimitive.Content>
                <DialogPrimitive.Title>Question workflow</DialogPrimitive.Title>
                <DialogPrimitive.Description>Send a support question.</DialogPrimitive.Description>
                <label>
                  Subject
                  <input />
                </label>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </>
      );
    }

    render(<FocusHandoffHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates, 1 new" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));

    const workflow = await screen.findByRole("dialog", { name: "Question workflow" });
    await waitFor(() => expect(workflow.contains(document.activeElement)).toBe(true));
    expect(screen.queryByRole("dialog", { name: "Help & updates" })).toBeNull();
  });

  it("shows every unread update before filling the panel with recent read items", () => {
    const unread = [1, 2, 3, 4].map((index) => makeAnnouncement(index));
    render(<LauncherHarness items={unread} unreadCount={4} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates, 4 new" }));

    unread.forEach((announcement) => {
      expect(screen.getByText(announcement.title)).toBeTruthy();
    });
  });

  it("does not claim the user is up to date while releases are loading or unavailable", () => {
    const { rerender } = render(
      <LauncherHarness items={[]} unreadCount={0} announcementsPending />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates" }));
    expect(screen.getByText("Loading product updates…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close Help and updates" }));
    rerender(<LauncherHarness items={[]} unreadCount={0} announcementsError />);
    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates" }));
    expect(screen.getByText("Product updates are unavailable. Try again later.")).toBeTruthy();
    expect(screen.queryByText(/You're up to date/)).toBeNull();
  });

  it("keeps the marked update and its control mounted while unread items remain", async () => {
    const initial = [1, 2, 3, 4].map((index) => makeAnnouncement(index));

    function StatefulHarness() {
      const [items, setItems] = useState(initial);
      const [open, setOpen] = useState(false);
      return (
        <HelpUpdatesLauncher
          open={open}
          unreadCount={items.filter((item) => !item.readAt).length}
          announcements={items}
          announcementsPending={false}
          announcementsError={false}
          onOpenChange={setOpen}
          onAskQuestion={vi.fn()}
          onReportProblem={vi.fn()}
          onOpenMessages={vi.fn()}
          onMarkAnnouncementRead={(announcementId) => {
            setItems((current) =>
              current.map((item) =>
                item.id === announcementId ? { ...item, readAt: "2026-08-26T13:00:00.000Z" } : item,
              ),
            );
          }}
        />
      );
    }

    render(<StatefulHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open Help and updates, 4 new" }));

    const markButtons = screen.getAllByRole("button", { name: "Mark as read" });
    markButtons[0].focus();
    fireEvent.click(markButtons[0]);

    const seen = await screen.findByRole("button", { name: "Seen" });
    expect(document.activeElement).toBe(seen);
    expect(screen.getAllByText(/Product update/)).toHaveLength(4);
  });
});
