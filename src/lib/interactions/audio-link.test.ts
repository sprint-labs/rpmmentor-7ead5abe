import { describe, expect, it, vi } from "vitest";
import { linkInteractionAudio } from "@/lib/interactions/audio-link";

const INTERACTION_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";
const AUTHOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    interaction_id: INTERACTION_ID,
    media_id: MEDIA_ID,
    created_at: "2026-08-05T12:00:00.000Z",
    ...overrides,
  };
}

/**
 * Minimal Supabase query-builder stand-in. `interactions` selects resolve to
 * `interaction`; `interaction_media` inserts resolve to `insertResult` and
 * selects to `existingLink`.
 */
function makeDb(opts: {
  interaction?: Record<string, unknown> | null;
  insertResult?: { data?: unknown; error?: { code?: string; message: string } | null };
  existingLink?: Record<string, unknown> | null;
  onInsert?: (payload: Record<string, unknown>) => void;
}) {
  const insert = vi.fn((payload: Record<string, unknown>) => {
    opts.onInsert?.(payload);
    return {
      select: () => ({
        maybeSingle: async () => opts.insertResult ?? { data: linkRow(), error: null },
      }),
    };
  });

  const from = vi.fn((table: string) => {
    if (table === "interactions") {
      return {
        select: () => ({
          eq: () => ({
            is: (column: string, value: unknown) => {
              expect(column).toBe("deleted_at");
              expect(value).toBeNull();
              return {
                maybeSingle: async () => ({
                  data:
                    opts.interaction === undefined
                      ? { id: INTERACTION_ID, mentor_id: AUTHOR }
                      : opts.interaction,
                  error: null,
                }),
              };
            },
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.existingLink ?? null, error: null }),
          }),
        }),
      }),
      insert,
    };
  });

  return { db: { from }, insert };
}

const input = {
  interactionId: INTERACTION_ID,
  mediaId: MEDIA_ID,
  userId: AUTHOR,
  canManageAny: false,
};

describe("linking a recording to an interaction", () => {
  it("links the recording for the mentor who logged the interaction", async () => {
    const { db, insert } = makeDb({});

    const link = await linkInteractionAudio(db, input);

    expect(link).toMatchObject({ interactionId: INTERACTION_ID, mediaId: MEDIA_ID, created: true });
    // Linkage is by primary key only — never a name or a file name.
    expect(insert).toHaveBeenCalledWith({
      interaction_id: INTERACTION_ID,
      media_id: MEDIA_ID,
      attached_by: AUTHOR,
    });
  });

  it("refuses to attach audio to another user's interaction and writes nothing", async () => {
    const { db, insert } = makeDb({});

    await expect(linkInteractionAudio(db, { ...input, userId: OTHER_USER })).rejects.toThrow(
      /do not have permission/i,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("lets a management role attach audio to an interaction they did not log", async () => {
    const { db } = makeDb({});

    const link = await linkInteractionAudio(db, {
      ...input,
      userId: OTHER_USER,
      canManageAny: true,
    });

    expect(link.mediaId).toBe(MEDIA_ID);
  });

  it("converges on the existing link when the same recording is attached twice", async () => {
    const { db } = makeDb({
      insertResult: { error: { code: "23505", message: "duplicate key value" } },
      existingLink: linkRow(),
    });

    const link = await linkInteractionAudio(db, input);

    // Same row, reported as pre-existing rather than newly created.
    expect(link).toMatchObject({ id: "link-1", mediaId: MEDIA_ID, created: false });
  });

  it("never reports success when RLS silently refuses the insert", async () => {
    const { db } = makeDb({ insertResult: { data: null, error: null }, existingLink: null });

    await expect(linkInteractionAudio(db, input)).rejects.toThrow(/could not be confirmed/i);
  });

  it("fails clearly when the interaction no longer exists", async () => {
    const { db, insert } = makeDb({ interaction: null });

    await expect(linkInteractionAudio(db, input)).rejects.toThrow(/no longer exists/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it("surfaces a database error instead of claiming the recording was linked", async () => {
    const { db } = makeDb({
      insertResult: { error: { message: "new row violates row-level security policy" } },
    });

    await expect(linkInteractionAudio(db, input)).rejects.toThrow(/row-level security/i);
  });
});
