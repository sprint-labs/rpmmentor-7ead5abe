import { describe, expect, it, vi } from "vitest";
import {
  notifyEventAssigned,
  notifyEventCancelled,
  notifyEventChanged,
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

describe("notifyEventChanged", () => {
  function changedMatchDb(reportId: string | null) {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "match_reports_cache") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: reportId ? { report_id: reportId } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { insert };
    });
    return { db: { from }, insert };
  }

  it("does not ask for another report when participation is confirmed after completion", async () => {
    const { db, insert } = changedMatchDb("report-1");

    await expect(
      notifyEventChanged(
        db as never,
        ACTOR,
        { ...event, event_type: "Match", participation_status: "played" },
        {
          assigned_mentor_id: MENTOR,
          event_date: event.event_date,
          start_time: event.start_time,
          player_id: event.player_id,
          event_type: "Match",
          participation_status: "not_confirmed",
        },
      ),
    ).resolves.toBe(true);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Match Report: already submitted"),
        link_path: "/reports/report-1",
      }),
    );
    expect(insert.mock.calls[0]?.[0].body).not.toContain("You need to submit");
  });

  it("keeps the normal requirement when no active report is linked", async () => {
    const { db, insert } = changedMatchDb(null);

    await notifyEventChanged(
      db as never,
      ACTOR,
      { ...event, event_type: "Match", participation_status: "played" },
      {
        assigned_mentor_id: MENTOR,
        event_date: event.event_date,
        start_time: event.start_time,
        player_id: event.player_id,
        event_type: "Match",
        participation_status: "not_confirmed",
      },
    );

    expect(insert.mock.calls[0]?.[0].body).toContain("You need to submit: Match Report");
  });

  it("does not ask the new mentor for a second report when a completed Match is reassigned", async () => {
    const { db, insert } = changedMatchDb("report-1");
    const newMentor = "55555555-5555-4555-8555-555555555555";

    await expect(
      notifyEventChanged(
        db as never,
        ACTOR,
        {
          ...event,
          assigned_mentor_id: newMentor,
          event_type: "Match",
          participation_status: "played",
        },
        {
          assigned_mentor_id: MENTOR,
          event_date: event.event_date,
          start_time: event.start_time,
          player_id: event.player_id,
          event_type: "Match",
          participation_status: "played",
        },
      ),
    ).resolves.toBe(true);

    const assigned = insert.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload.kind === "event_assigned");
    expect(assigned).toMatchObject({
      recipient_id: newMentor,
      link_path: "/reports/report-1",
    });
    expect(assigned.body).toContain("Match Report: already submitted");
    expect(assigned.body).not.toContain("You need to submit");
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
        follow_up_basis: "match_played",
      }),
    );
    expect(insert.mock.calls[0]?.[0].link_path).toContain("eventId=");
  });

  it.each(["not_confirmed", "did_not_play"])(
    "fails closed instead of inserting a Match reminder for %s participation",
    async (participation_status) => {
      const insert = vi.fn().mockResolvedValue({ error: null });
      const supabase = { from: vi.fn(() => ({ insert })) };

      await expect(
        notifyFollowUpOverdue(supabase as never, ACTOR, {
          ...event,
          event_type: "Match",
          participation_status,
        }),
      ).resolves.toBe(false);
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it("preserves overdue interaction reminders with their own eligibility basis", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) };

    await expect(notifyFollowUpOverdue(supabase as never, ACTOR, event)).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ follow_up_basis: "interaction" }),
    );
  });
});
