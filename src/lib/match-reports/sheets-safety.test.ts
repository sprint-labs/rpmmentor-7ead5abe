import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV = { LOVABLE_API_KEY: "lovable-key", GOOGLE_SHEETS_API_KEY: "conn-key" };

async function loadSheets() {
  vi.resetModules();
  return await import("./sheets.server");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sheets append — configuration vs ambiguous transport", () => {
  beforeEach(() => {
    process.env.LOVABLE_API_KEY = ENV.LOVABLE_API_KEY;
    process.env.GOOGLE_SHEETS_API_KEY = ENV.GOOGLE_SHEETS_API_KEY;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("missing connector config is a DEFINITIVE failure, never ambiguous", async () => {
    delete process.env.GOOGLE_SHEETS_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { appendRow, SheetsConfigError, AmbiguousAppendError } = await loadSheets();

    await expect(appendRow(["a"])).rejects.toBeInstanceOf(SheetsConfigError);
    await expect(appendRow(["a"])).rejects.not.toBeInstanceOf(AmbiguousAppendError);
    // No request left the app.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gateway credential rejection (403) is a definitive no-write failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("forbidden", { status: 403 }));
    const { appendRow, SheetsConfigError } = await loadSheets();
    await expect(appendRow(["a"])).rejects.toBeInstanceOf(SheetsConfigError);
  });

  it("network failure after dispatch is ambiguous", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket hang up"));
    const { appendRow, AmbiguousAppendError } = await loadSheets();
    await expect(appendRow(["a"])).rejects.toBeInstanceOf(AmbiguousAppendError);
  });

  it("2xx with an unparsable body is AMBIGUOUS (a row may exist)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>not json</html>", { status: 200 }),
    );
    const { appendRow, AmbiguousAppendError } = await loadSheets();
    await expect(appendRow(["a"])).rejects.toBeInstanceOf(AmbiguousAppendError);
  });

  it("2xx without a parsable updatedRange is AMBIGUOUS, not failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ updates: {} }));
    const { appendRow, AmbiguousAppendError } = await loadSheets();
    await expect(appendRow(["a"])).rejects.toBeInstanceOf(AmbiguousAppendError);
  });

  it("2xx with a valid updatedRange returns the row index", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ updates: { updatedRange: "'GKHQ Propietry Data Hub'!A6:O6" } }),
    );
    const { appendRow } = await loadSheets();
    await expect(appendRow(["a"])).resolves.toBe(6);
  });

  it("append is attempted exactly once, even on a retryable 503", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("upstream", { status: 503 }));
    const { appendRow, AmbiguousAppendError } = await loadSheets();
    await expect(appendRow(["a"])).rejects.toBeInstanceOf(AmbiguousAppendError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("sheets delete — destructive single-attempt safety", () => {
  beforeEach(() => {
    process.env.LOVABLE_API_KEY = ENV.LOVABLE_API_KEY;
    process.env.GOOGLE_SHEETS_API_KEY = ENV.GOOGLE_SHEETS_API_KEY;
  });
  afterEach(() => vi.restoreAllMocks());

  /** First call resolves the sheet gid; later calls are the batchUpdate. */
  function mockGidThen(deleteImpl: () => Promise<Response>) {
    let n = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      n += 1;
      if (n === 1) {
        return jsonResponse({
          sheets: [{ properties: { sheetId: 42, title: "GKHQ Propietry Data Hub" } }],
        });
      }
      return deleteImpl();
    });
  }

  it("a 5xx delete never issues a second delete and surfaces ambiguity", async () => {
    const fetchSpy = mockGidThen(async () => new Response("boom", { status: 500 }));
    const { deleteRow, AmbiguousDeleteError } = await loadSheets();
    await expect(deleteRow(7)).rejects.toBeInstanceOf(AmbiguousDeleteError);
    // 1 metadata read + exactly 1 batchUpdate.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("a lost network response never issues a second delete", async () => {
    const fetchSpy = mockGidThen(async () => {
      throw new Error("connection reset");
    });
    const { deleteRow, AmbiguousDeleteError } = await loadSheets();
    await expect(deleteRow(9)).rejects.toBeInstanceOf(AmbiguousDeleteError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("refuses obviously invalid row indexes (never touches the header row)", async () => {
    const { deleteRow } = await loadSheets();
    await expect(deleteRow(1)).rejects.toThrow(/invalid row index/i);
    await expect(deleteRow(0)).rejects.toThrow(/invalid row index/i);
  });

  it("a clean 200 delete resolves", async () => {
    mockGidThen(async () => jsonResponse({ replies: [{}] }));
    const { deleteRow } = await loadSheets();
    await expect(deleteRow(5)).resolves.toBeUndefined();
  });
});
