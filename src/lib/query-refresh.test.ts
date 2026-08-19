import { describe, it, expect } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { refreshInteractionViews } from "./query-refresh";

/** Captures the query keys a refresh helper invalidates. */
function recordingClient() {
  const keys: unknown[][] = [];
  const client = {
    invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
      keys.push(queryKey);
      return Promise.resolve();
    },
  } as unknown as QueryClient;
  return { client, keys };
}

describe("refreshInteractionViews", () => {
  it("refreshes the calendar's missing-report badges", async () => {
    // Without this, logging an interaction or submitting a Match Report leaves
    // the badges showing the type just logged as still missing.
    const { client, keys } = recordingClient();
    await refreshInteractionViews(client);
    expect(keys).toContainEqual(["calendar", "report-coverage"]);
  });

  it("refreshes follow-up statuses, so a saved write-up reads as Completed", async () => {
    const { client, keys } = recordingClient();
    await refreshInteractionViews(client);
    expect(keys).toContainEqual(["events", "follow-ups"]);
  });

  it("still refreshes the interaction log and the dashboard stats", async () => {
    const { client, keys } = recordingClient();
    await refreshInteractionViews(client);
    expect(keys).toContainEqual(["interactions", "page"]);
    expect(keys).toContainEqual(["interactions", "audio"]);
    expect(keys).toContainEqual(["mentor-dashboard-stats"]);
    expect(keys).toContainEqual(["overview-dashboard-stats"]);
    expect(keys).toContainEqual(["executive-dashboard-stats"]);
  });
});
