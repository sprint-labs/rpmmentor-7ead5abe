import { describe, expect, it, vi } from "vitest";
import { notifyEventCancelled, type NotifiableEventRow } from "./notify.server";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const MENTOR = "22222222-2222-4222-8222-222222222222";

const event: NotifiableEventRow = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Training visit",
  event_type: "Training Ground Visit",
  event_date: "2026-08-15",
  start_time: "10:00",
  goalkeeper_name: "Demo Keeper",
  player_id: "44444444-4444-4444-8444-444444444444",
  assigned_mentor_id: MENTOR,
};

describe("notifyEventCancelled", () => {
  it("reports when no separate mentor notification is required", async () => {
    const from = vi.fn();
    await expect(
      notifyEventCancelled({ from } as never, ACTOR, { ...event, assigned_mentor_id: ACTOR }, ""),
    ).resolves.toBe("not_required");
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [null, "delivered"],
    [{ message: "insert failed" }, "failed"],
  ])("reports the real insert outcome", async (error, expected) => {
    const insert = vi.fn().mockResolvedValue({ error });
    const supabase = { from: vi.fn(() => ({ insert })) };
    await expect(notifyEventCancelled(supabase as never, ACTOR, event, "Postponed")).resolves.toBe(
      expected,
    );
    expect(insert).toHaveBeenCalledOnce();
  });
});
