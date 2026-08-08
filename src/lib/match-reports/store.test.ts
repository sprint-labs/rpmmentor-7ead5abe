/**
 * Canonical store guarantees that the Sheets pipeline used to provide:
 *  - a retry of the same submission never produces a second report;
 *  - a confirmed duplicate fixture gets its own ~2/~3 occurrence identity;
 *  - a tombstoned report is neither returned nor has its identity reused.
 */
import { describe, it, expect } from "vitest";
import {
  insertCanonicalReport,
  getCanonicalReport,
  listCanonicalReports,
  softDeleteCanonicalReport,
  toMatchReportRow,
} from "./store.server";

interface Row {
  report_id: string;
  submission_key: string | null;
  deleted_at: string | null;
  legacy_report_id: string | null;
  goalkeeper: string;
  coach: string;
  team: string | null;
  opponent: string | null;
  competition: string | null;
  match_date: string | null;
  average: number | null;
  comments: string | null;
  row_index: number | null;
  [k: string]: unknown;
}

/** Minimal PostgREST-shaped fake with the two unique indexes the schema has. */
function fakeDb(seed: Partial<Row>[] = []) {
  const rows: Row[] = seed.map((r) => ({
    report_id: "",
    submission_key: null,
    deleted_at: null,
    legacy_report_id: null,
    goalkeeper: "",
    coach: "",
    team: null,
    opponent: null,
    competition: null,
    match_date: null,
    average: null,
    comments: "",
    row_index: null,
    ...r,
  })) as Row[];

  const makeQuery = (initial: Row[]) => {
    let working = initial;
    let pendingInsert: Row | null = null;
    let pendingUpdate: Partial<Row> | null = null;
    const q: Record<string, unknown> = {};

    const api = {
      select: () => api,
      order: () => api,
      limit: (n: number) => {
        working = working.slice(0, n);
        return api;
      },
      range: (from: number, to: number) => {
        working = working.slice(from, to + 1);
        return api;
      },
      eq: (col: string, value: unknown) => {
        q[col] = value;
        working = working.filter((r) => r[col] === value);
        return api;
      },
      is: (col: string, value: unknown) => {
        // Columns the insert omits are NULL in Postgres, not absent.
        working = working.filter((r) => (r[col] ?? null) === value);
        return api;
      },
      like: (col: string, pattern: string) => {
        const prefix = pattern.replace(/%$/, "");
        working = working.filter((r) => String(r[col] ?? "").startsWith(prefix));
        return api;
      },
      insert: (row: Row) => {
        pendingInsert = row;
        return api;
      },
      update: (patch: Partial<Row>) => {
        pendingUpdate = patch;
        return api;
      },
      maybeSingle: async () => {
        if (pendingInsert) return commitInsert();
        return { data: working[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (pendingInsert) return Promise.resolve(commitInsert()).then(resolve);
        if (pendingUpdate) {
          for (const r of working) Object.assign(r, pendingUpdate);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: working, error: null }).then(resolve);
      },
    };

    function commitInsert() {
      const row = pendingInsert as Row;
      pendingInsert = null;
      if (rows.some((r) => r.report_id === row.report_id)) {
        return { data: null, error: { code: "23505", message: "duplicate report_id" } };
      }
      if (row.submission_key && rows.some((r) => r.submission_key === row.submission_key)) {
        return { data: null, error: { code: "23505", message: "duplicate submission_key" } };
      }
      rows.push(row);
      return { data: { report_id: row.report_id }, error: null };
    }

    return api;
  };

  return {
    rows,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    from: (_table: string) => makeQuery([...rows]) as any,
  };
}

const base = {
  baseReportId: "mr2_aaaa1111",
  legacyReportId: "mr_bbbb2222",
  goalkeeper: "Jake Eastwood",
  coach: "Andy Marshall",
  team: "Cambridge United",
  opponent: "Barnet",
  competition: "League Two",
  match_date: "2026-08-01",
  scores: {
    protect_goal: 4,
    protect_space: 4,
    protect_air: 3,
    control_play: 4,
    change_play: 4,
    psych: 4,
    physical: 4,
  },
  average: 3.9,
  comments: "Solid.",
  submittedBy: "user-1",
};

describe("canonical match report store", () => {
  it("writes exactly one report and returns its identity", async () => {
    const db = fakeDb();
    const res = await insertCanonicalReport(db, { ...base, submissionKey: "key-1" });
    expect(res).toEqual({ ok: true, report_id: "mr2_aaaa1111", created: true });
    expect(db.rows).toHaveLength(1);
  });

  it("a retry with the SAME submission key never creates a second report", async () => {
    const db = fakeDb();
    const first = await insertCanonicalReport(db, { ...base, submissionKey: "key-1" });
    const retry = await insertCanonicalReport(db, { ...base, submissionKey: "key-1" });
    expect(first.ok && retry.ok).toBe(true);
    expect(retry).toEqual({ ok: true, report_id: "mr2_aaaa1111", created: false });
    expect(db.rows).toHaveLength(1);
  });

  it("a confirmed duplicate fixture gets its own occurrence identity", async () => {
    const db = fakeDb();
    await insertCanonicalReport(db, { ...base, submissionKey: "key-1" });
    const second = await insertCanonicalReport(db, { ...base, submissionKey: "key-2" });
    const third = await insertCanonicalReport(db, { ...base, submissionKey: "key-3" });
    expect(second).toEqual({ ok: true, report_id: "mr2_aaaa1111~2", created: true });
    expect(third).toEqual({ ok: true, report_id: "mr2_aaaa1111~3", created: true });
    expect(db.rows).toHaveLength(3);
  });

  it("resolves a report by exact, base and legacy identity", async () => {
    const db = fakeDb();
    await insertCanonicalReport(db, { ...base, submissionKey: "key-1" });
    await insertCanonicalReport(db, { ...base, submissionKey: "key-2" });

    expect((await getCanonicalReport(db, "mr2_aaaa1111~2"))?.report_id).toBe("mr2_aaaa1111~2");
    expect((await getCanonicalReport(db, "mr2_aaaa1111"))?.report_id).toBe("mr2_aaaa1111");
    expect((await getCanonicalReport(db, "mr_bbbb2222"))?.report_id).toBe("mr2_aaaa1111");
    expect(await getCanonicalReport(db, "mr2_nope0000")).toBeNull();
  });

  it("a deleted report disappears from reads but keeps its identity reserved", async () => {
    const db = fakeDb();
    await insertCanonicalReport(db, { ...base, submissionKey: "key-1" });

    const removed = await softDeleteCanonicalReport(db, "mr2_aaaa1111");
    expect(removed).toMatchObject({ deleted: true, report_id: "mr2_aaaa1111" });
    expect(await getCanonicalReport(db, "mr2_aaaa1111")).toBeNull();
    expect(await listCanonicalReports(db)).toHaveLength(0);
    // Nothing was destroyed — the tombstoned row is still there.
    expect(db.rows).toHaveLength(1);

    // A new submission for the same fixture must NOT wear the deleted identity.
    const again = await insertCanonicalReport(db, { ...base, submissionKey: "key-2" });
    expect(again).toEqual({ ok: true, report_id: "mr2_aaaa1111~2", created: true });
  });

  it("deleting a report that isn't there is reported, not guessed", async () => {
    const db = fakeDb();
    expect(await softDeleteCanonicalReport(db, "mr2_missing")).toEqual({
      deleted: false,
      report_id: null,
      row_index: null,
    });
  });

  it("maps a database row onto the shape every report screen consumes", () => {
    const row = toMatchReportRow({
      report_id: "mr2_aaaa1111",
      legacy_report_id: "mr_bbbb2222",
      row_index: 42,
      goalkeeper: "Jake Eastwood",
      coach: "Andy Marshall",
      team: "Cambridge United",
      opponent: "Barnet",
      competition: null,
      match_date: "2026-08-01",
      protect_goal: 4,
      protect_space: 4,
      protect_air: 3,
      control_play: 4,
      change_play: 4,
      psych: 4,
      physical: 4,
      // numerics can arrive as strings over the wire
      average: "3.9",
      comments: null,
    });
    expect(row.average).toBe(3.9);
    expect(row.comments).toBe("");
    expect(row.scores.protect_air).toBe(3);
    // The legacy sheet row survives as traceability back to the archive.
    expect(row.row_index).toBe(42);
  });
});
