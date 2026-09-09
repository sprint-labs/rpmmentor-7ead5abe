import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterCancelledActiveEventNotifications,
  filterCurrentOverdueNotifications,
  visibleUnreadNotificationIds,
  type AppNotification,
} from "./notifications.functions";

function notification(
  id: string,
  kind: string,
  eventId: string | null,
  readAt: string | null = null,
  followUpBasis: AppNotification["followUpBasis"] = null,
): AppNotification {
  return {
    id,
    kind,
    eventId,
    readAt,
    followUpBasis,
    title: id,
    body: "",
    linkPath: "/follow-ups",
    createdAt: "2026-08-20T12:00:00Z",
  };
}

describe("filterCurrentOverdueNotifications", () => {
  it("keeps only reminders whose event is still legitimately overdue", () => {
    const items = [
      notification("played", "follow_up_overdue", "event-played", null, "match_played"),
      notification("unconfirmed", "follow_up_overdue", "event-unconfirmed"),
      notification("did-not-play", "follow_up_overdue", "event-dnp"),
      notification("assignment", "event_assigned", "event-unconfirmed"),
    ];

    expect(
      filterCurrentOverdueNotifications(items, new Map([["event-played", "match_played"]])).map(
        (item) => item.id,
      ),
    ).toEqual(["played", "assignment"]);
  });

  it("hides an orphaned overdue reminder but preserves unrelated inbox history", () => {
    const items = [
      notification("orphan", "follow_up_overdue", null),
      notification("updated", "event_updated", "event-1", "2026-08-21T12:00:00Z"),
    ];
    expect(filterCurrentOverdueNotifications(items, new Map()).map((item) => item.id)).toEqual([
      "updated",
    ]);
  });

  it("keeps a legacy false row hidden even after the event later becomes overdue", () => {
    const legacy = notification("legacy", "follow_up_overdue", "event-played");
    expect(
      filterCurrentOverdueNotifications([legacy], new Map([["event-played", "match_played"]])),
    ).toEqual([]);
  });

  it.each([
    ["match_played", "interaction"],
    ["interaction", "match_played"],
  ] as const)(
    "hides a stale %s reminder after the event obligation changes to %s",
    (storedBasis, currentBasis) => {
      const stale = notification("stale", "follow_up_overdue", "event-1", null, storedBasis);
      const current = notification("current", "follow_up_overdue", "event-1", null, currentBasis);
      expect(
        filterCurrentOverdueNotifications(
          [stale, current],
          new Map([["event-1", currentBasis]]),
        ).map((item) => item.id),
      ).toEqual(["current"]);
    },
  );

  it("carries the resolved Played status into overdue notification creation", () => {
    const source = readFileSync(new URL("./notifications.functions.ts", import.meta.url), "utf8");
    expect(source).toContain("participation_status: row.participationStatus");
  });
});

describe("visibleUnreadNotificationIds", () => {
  it("marks only the unread rows returned in the visible inbox", () => {
    expect(
      visibleUnreadNotificationIds([
        notification("visible-unread", "event_updated", "event-1"),
        notification("visible-read", "event_updated", "event-2", "2026-08-21T12:00:00Z"),
      ]),
    ).toEqual(["visible-unread"]);
  });
});

describe("overdue notification basis migration", () => {
  it("backfills only when current obligation and stored link provenance agree", () => {
    const migration = readFileSync(
      new URL(
        "../../../supabase/migrations/20260903153746_match_report_event_snapshot_guard.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain("notification.link_path LIKE '/reports?%'");
    expect(migration).toContain("notification.link_path LIKE '/interactions?%'");
  });
});

describe("filterCancelledActiveEventNotifications", () => {
  it("hides stale actionable copies for a cancelled Match but retains cancellation history", () => {
    const items = [
      notification("assigned", "event_assigned", "cancelled-match"),
      notification("updated", "event_updated", "cancelled-match"),
      notification("cancelled", "event_cancelled", "cancelled-match"),
      notification("active-update", "event_updated", "active-match"),
      notification("unlinked-update", "event_updated", null),
    ];

    expect(
      filterCancelledActiveEventNotifications(items, new Set(["cancelled-match"])).map(
        (item) => item.id,
      ),
    ).toEqual(["cancelled", "active-update", "unlinked-update"]);
  });

  it("reconciles cancellation from the current calendar row in bounded batches", () => {
    const source = readFileSync(new URL("./notifications.functions.ts", import.meta.url), "utf8");
    expect(source).toContain('.from("calendar_events")');
    expect(source).toContain('.select("id, status")');
    expect(source).toContain("EVENT_STATUS_BATCH");
    expect(source).toContain("filterCancelledActiveEventNotifications(items, cancelledIds)");
  });
});
