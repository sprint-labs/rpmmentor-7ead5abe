import { describe, expect, it, vi } from "vitest";
import { readAllPages } from "./paginated-read";

describe("readAllPages", () => {
  it("returns complete results across the 500 and 1,000 row boundaries", async () => {
    const source = Array.from({ length: 1_205 }, (_, id) => ({ id }));
    const readPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));

    const rows = await readAllPages(readPage, "Could not load rows.");

    expect(rows).toEqual(source);
    expect(readPage.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("reads one final empty page when the total is an exact page multiple", async () => {
    const source = Array.from({ length: 1_000 }, (_, id) => ({ id }));
    const readPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));

    await expect(readAllPages(readPage, "Could not load rows.")).resolves.toEqual(source);
    expect(readPage).toHaveBeenLastCalledWith(1000, 1499);
  });

  it("fails instead of returning a partial row set", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, id) => ({ id })),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });

    await expect(readAllPages(readPage, "Could not load rows.")).rejects.toThrow(
      "Could not load rows.",
    );
  });
});
