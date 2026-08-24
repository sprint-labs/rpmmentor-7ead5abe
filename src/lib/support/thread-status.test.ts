import { describe, expect, it } from "vitest";
import { nextSupportThreadStatus } from "./thread-status";

describe("nextSupportThreadStatus", () => {
  it("moves to waiting_on_admin when the author writes", () => {
    expect(
      nextSupportThreadStatus({ currentStatus: "open", messageAuthorIsThreadAuthor: true }),
    ).toBe("waiting_on_admin");
    expect(
      nextSupportThreadStatus({
        currentStatus: "waiting_on_user",
        messageAuthorIsThreadAuthor: true,
      }),
    ).toBe("waiting_on_admin");
  });

  it("moves to waiting_on_user when an admin writes on an open thread", () => {
    expect(
      nextSupportThreadStatus({ currentStatus: "open", messageAuthorIsThreadAuthor: false }),
    ).toBe("waiting_on_user");
  });

  it("reopens to waiting_on_admin when the author replies on a resolved thread", () => {
    expect(
      nextSupportThreadStatus({
        currentStatus: "resolved",
        messageAuthorIsThreadAuthor: true,
      }),
    ).toBe("waiting_on_admin");
  });

  it("stays resolved when an admin replies on a resolved thread", () => {
    expect(
      nextSupportThreadStatus({
        currentStatus: "resolved",
        messageAuthorIsThreadAuthor: false,
      }),
    ).toBe("resolved");
  });
});
