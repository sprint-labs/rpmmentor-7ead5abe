import { describe, expect, it, vi } from "vitest";
import {
  countDistinctMentorAccounts,
  getActiveMentorCount,
  hasActiveMentorAccess,
} from "./active-mentors";

describe("active mentor accounts", () => {
  it("counts mentor and mentor-manager access, but not unrelated app roles", () => {
    expect(hasActiveMentorAccess("mentor")).toBe(true);
    expect(hasActiveMentorAccess("mentor_manager")).toBe(true);
    expect(hasActiveMentorAccess("admin")).toBe(false);
    expect(hasActiveMentorAccess("super_admin")).toBe(false);
    expect(hasActiveMentorAccess(null)).toBe(false);
  });

  it("counts distinct account ids", () => {
    expect(
      countDistinctMentorAccounts([{ id: "mentor-1" }, { id: "manager-1" }, { id: "mentor-1" }]),
    ).toBe(2);
  });

  it("uses the RLS-safe mentor directory RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { id: "mentor-1", name: "Mentor One", is_manager: false },
        { id: "manager-1", name: "Manager One", is_manager: true },
      ],
      error: null,
    });

    await expect(getActiveMentorCount({ rpc } as never)).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("list_mentor_directory");
  });

  it("fails closed instead of converting a directory error to zero", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "directory unavailable" },
    });

    await expect(getActiveMentorCount({ rpc } as never)).rejects.toThrow(
      "Could not load active mentors",
    );
  });
});
