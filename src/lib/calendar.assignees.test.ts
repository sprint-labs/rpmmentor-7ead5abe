import { describe, expect, it } from "vitest";
import { resolveEventPeople } from "./calendar.functions";

const PLAYER = "11111111-1111-4111-8111-111111111111";
const MENTOR = "22222222-2222-4222-8222-222222222222";

function fakeClient(options: {
  mentors?: Array<{ id: string; name: string | null; is_manager: boolean }>;
  directoryError?: { message: string } | null;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { full_name: "Demo Keeper" }, error: null }),
        }),
      }),
    }),
    rpc: async () => ({
      data: options.mentors ?? [],
      error: options.directoryError ?? null,
    }),
  };
}

describe("resolveEventPeople", () => {
  it.each([false, true])("accepts a current directory mentor, manager=%s", async (isManager) => {
    const result = await resolveEventPeople(
      fakeClient({
        mentors: [{ id: MENTOR, name: "Morgan Mentor", is_manager: isManager }],
      }) as never,
      PLAYER,
      MENTOR,
    );
    expect(result).toEqual({
      goalkeeper_name: "Demo Keeper",
      assigned_mentor_name: "Morgan Mentor",
    });
  });

  it("rejects an account no longer present in the assignable mentor directory", async () => {
    await expect(
      resolveEventPeople(fakeClient({ mentors: [] }) as never, PLAYER, MENTOR),
    ).rejects.toThrow(/not currently an assignable mentor/i);
  });

  it("fails closed when the mentor directory cannot be checked", async () => {
    await expect(
      resolveEventPeople(
        fakeClient({ directoryError: { message: "directory unavailable" } }) as never,
        PLAYER,
        MENTOR,
      ),
    ).rejects.toThrow("directory unavailable");
  });
});
