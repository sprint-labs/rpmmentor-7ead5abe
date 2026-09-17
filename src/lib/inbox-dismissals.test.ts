// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  loadResolvedInboxIds,
  pruneResolvedInboxIds,
  saveResolvedInboxIds,
} from "./inbox-dismissals";

afterEach(() => {
  window.localStorage.clear();
});

describe("resolved inbox notifications", () => {
  it("keeps resolutions scoped to the signed-in account", () => {
    saveResolvedInboxIds("user-a", ["notif-1"]);
    expect(loadResolvedInboxIds("user-a")).toEqual(["notif-1"]);
    expect(loadResolvedInboxIds("user-b")).toEqual([]);
  });

  it("forgets resolutions whose notification has aged out of the inbox", () => {
    expect(pruneResolvedInboxIds(["notif-1", "notif-2"], ["notif-2", "notif-3"])).toEqual([
      "notif-2",
    ]);
  });

  it("ignores malformed stored state rather than hiding nothing at all", () => {
    window.localStorage.setItem("rpm.inbox.resolved.v1:user-a", "not json");
    expect(loadResolvedInboxIds("user-a")).toEqual([]);
  });
});
