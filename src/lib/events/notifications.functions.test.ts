import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterCurrentOverdueNotifications, type AppNotification } from "./notifications.functions";

function notification(
  id: string,
  kind: string,
  eventId: string | null,
  readAt: string | null = null,
): AppNotification {
  return {
    id,
    kind,
    eventId,
    readAt,
    title: id,
    body: "",
    linkPath: "/follow-ups",
    createdAt: "2026-08-20T12:00:00Z",
  };
}

describe("filterCurrentOverdueNotifications", () => {
  it("keeps only reminders whose event is still legitimately overdue", () => {
    const items = [
      notification("played", "follow_up_overdue", "event-played"),
      notification("unconfirmed", "follow_up_overdue", "event-unconfirmed"),
      notification("did-not-play", "follow_up_overdue", "event-dnp"),
      notification("assignment", "event_assigned", "event-unconfirmed"),
    ];

    expect(
      filterCurrentOverdueNotifications(items, new Set(["event-played"])).map((item) => item.id),
    ).toEqual(["played", "assignment"]);
  });

  it("hides an orphaned overdue reminder but preserves unrelated inbox history", () => {
    const items = [
      notification("orphan", "follow_up_overdue", null),
      notification("updated", "event_updated", "event-1", "2026-08-21T12:00:00Z"),
    ];
    expect(filterCurrentOverdueNotifications(items, new Set()).map((item) => item.id)).toEqual([
      "updated",
    ]);
  });

  it("carries the resolved Played status into overdue notification creation", () => {
    const source = readFileSync(new URL("./notifications.functions.ts", import.meta.url), "utf8");
    expect(source).toContain("participation_status: row.participationStatus");
  });
});
