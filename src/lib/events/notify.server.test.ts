import { describe, expect, it, vi } from "vitest";
import {
  notifyEventAssigned,
  notifyEventCancelled,
  notifyFollowUpOverdue,
  type NotifiableEventRow,
} from "./notify.server";

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

describe("notifyEventAssigned", () => {
  it("does not tell an ordinary assigned mentor to perform a management-only confirmation", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) };

    await expect(
      notifyEventAssigned(supabase as never, ACTOR, {
        ...event,
        event_type: "Match",
        participation_status: "not_confirmed",
      }),
    ).resolves.toBe(true);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: MENTOR,
        body: expect.stringContaining(
          "a Mentor Manager or administrator needs to confirm who played",
        ),
      }),
    );
    expect(insert.mock.calls[0]?.[0].body).not.toContain("Action: confirm");
  });
});

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

describe("notifyFollowUpOverdue", () => {
  it("creates a Match Report reminder and link for a goalkeeper confirmed as Played", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) };

    await expect(
      notifyFollowUpOverdue(supabase as never, ACTOR, {
        ...event,
        title: "Northbridge v Riverside",
        event_type: "Match",
        participation_status: "played",
      }),
    ).resolves.toBe(true);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Match Report"),
        link_path: expect.stringContaining("/reports?"),
      }),
    );
    expect(insert.mock.calls[0]?.[0].link_path).toContain("eventId=");
  });
});
