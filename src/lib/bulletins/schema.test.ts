import { describe, expect, it } from "vitest";
import {
  addBulletinUpdateInput,
  bulletinDetailQuery,
  bulletinDraftInput,
  bulletinSummaryQuery,
  createBulletinInput,
  listBulletinsQuery,
  mapBulletinItemRow,
  mapBulletinUpdateRow,
  updateBulletinInput,
} from "./schema";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const UPDATE_ID = "44444444-4444-4444-8444-444444444444";

describe("Bulletin Board input contracts", () => {
  it("normalises a minimal draft and applies safe defaults", () => {
    expect(
      bulletinDraftInput.parse({
        kind: "deal",
        title: "  Confirm club requirement  ",
        subjectName: "  Northbridge FC  ",
      }),
    ).toEqual({
      kind: "deal",
      title: "Confirm club requirement",
      details: "",
      subjectType: "other",
      subjectName: "Northbridge FC",
      status: "open",
      ownerId: null,
      nextAction: "",
      dueDate: null,
    });
  });

  it("requires an explicit view scope for every scoped read and create", () => {
    expect(
      createBulletinInput.parse({
        scope: "mine",
        kind: "daily_update",
        title: "Call complete",
        subjectName: "Northbridge FC",
      }).scope,
    ).toBe("mine");
    expect(bulletinSummaryQuery.parse({ scope: "team" })).toEqual({ scope: "team" });

    expect(() =>
      createBulletinInput.parse({
        kind: "daily_update",
        title: "Call complete",
        subjectName: "Northbridge FC",
      }),
    ).toThrow();
    expect(() => bulletinSummaryQuery.parse({})).toThrow();
    expect(() => bulletinSummaryQuery.parse({ scope: "everyone" })).toThrow();
  });

  it("accepts every real board kind and rejects invented board/status values", () => {
    for (const kind of ["daily_update", "deal", "lead", "mandate"] as const) {
      expect(bulletinDraftInput.parse({ kind, title: "Action", subjectName: "Subject" }).kind).toBe(
        kind,
      );
    }
    expect(() =>
      bulletinDraftInput.parse({
        kind: "completed_transfer",
        title: "Action",
        subjectName: "Club",
      }),
    ).toThrow();
    expect(() =>
      bulletinDraftInput.parse({
        kind: "deal",
        title: "Action",
        subjectName: "Club",
        status: "won",
      }),
    ).toThrow();
  });

  it("rejects invalid owner ids, date-only values and oversized notes", () => {
    const base = { kind: "lead", title: "Call", subjectName: "A player" };
    expect(() => bulletinDraftInput.parse({ ...base, ownerId: "Morgan" })).toThrow();
    expect(() => bulletinDraftInput.parse({ ...base, dueDate: "28/08/2026" })).toThrow();
    expect(() => bulletinDraftInput.parse({ ...base, details: "x".repeat(8001) })).toThrow();
  });

  it("requires optimistic version input for a structured edit and never accepts kind as editable", () => {
    const parsed = updateBulletinInput.parse({
      scope: "team",
      id: ITEM_ID,
      expectedVersion: 3,
      kind: "mandate",
      title: "Updated title",
      subjectName: "Riverside FC",
    });
    expect(parsed.expectedVersion).toBe(3);
    expect(parsed).not.toHaveProperty("kind");
    expect(() =>
      updateBulletinInput.parse({
        scope: "team",
        id: ITEM_ID,
        expectedVersion: 0,
        title: "Updated title",
        subjectName: "Riverside FC",
      }),
    ).toThrow();
  });

  it("bounds pagination and append-only update bodies", () => {
    expect(listBulletinsQuery.parse({ scope: "mine", kind: "daily_update" })).toMatchObject({
      scope: "mine",
      page: 1,
      pageSize: 20,
    });
    expect(bulletinDetailQuery.parse({ scope: "team", id: ITEM_ID })).toMatchObject({
      scope: "team",
      updatesPage: 1,
      updatesPageSize: 20,
    });
    expect(() =>
      listBulletinsQuery.parse({ scope: "mine", kind: "daily_update", pageSize: 101 }),
    ).toThrow();
    expect(() => listBulletinsQuery.parse({ kind: "daily_update" })).toThrow();
    expect(() => bulletinDetailQuery.parse({ id: ITEM_ID })).toThrow();
    expect(() => addBulletinUpdateInput.parse({ bulletinId: ITEM_ID, body: "   " })).toThrow();
    expect(() =>
      addBulletinUpdateInput.parse({ bulletinId: ITEM_ID, body: "x".repeat(4001) }),
    ).toThrow();
  });
});

describe("Bulletin Board runtime row boundary", () => {
  const itemRow = {
    id: ITEM_ID,
    kind: "deal",
    title: "Confirm requirement",
    details: "Club wants an experienced goalkeeper.",
    subject_type: "club",
    subject_name: "Northbridge FC",
    status: "working",
    owner_id: OWNER_ID,
    owner_name: "Morgan Mentor",
    next_action: "Call the sporting director",
    due_date: "2026-08-31",
    created_by: CREATOR_ID,
    created_by_name: "Riley Manager",
    created_at: "2026-08-28T10:00:00+00:00",
    updated_at: "2026-08-28T11:00:00+00:00",
    last_update_at: "2026-08-28T11:00:00+00:00",
    version: 2,
  } as const;

  it("maps snake-case item rows and preserves the concurrency version", () => {
    expect(mapBulletinItemRow(itemRow)).toMatchObject({
      id: ITEM_ID,
      kind: "deal",
      subjectType: "club",
      subjectName: "Northbridge FC",
      ownerId: OWNER_ID,
      dueDate: "2026-08-31",
      version: 2,
    });
  });

  it("fails closed when a stored row contains an unsupported value", () => {
    expect(() => mapBulletinItemRow({ ...itemRow, kind: "spreadsheet_tab" })).toThrow();
    expect(() => mapBulletinItemRow({ ...itemRow, version: 0 })).toThrow();
  });

  it("maps append-only update rows", () => {
    expect(
      mapBulletinUpdateRow({
        id: UPDATE_ID,
        bulletin_id: ITEM_ID,
        author_id: CREATOR_ID,
        author_name: "Riley Manager",
        body: "Club call booked for Monday.",
        created_at: "2026-08-28T12:00:00+00:00",
      }),
    ).toEqual({
      id: UPDATE_ID,
      bulletinId: ITEM_ID,
      authorId: CREATOR_ID,
      authorName: "Riley Manager",
      body: "Club call booked for Monday.",
      createdAt: "2026-08-28T12:00:00+00:00",
    });
  });
});
