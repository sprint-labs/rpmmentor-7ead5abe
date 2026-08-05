/**
 * Guards against demo or test data reappearing in the product.
 *
 * The "Just testing…" interaction that reached production came from seeded
 * sample data. The rows themselves have been purged and the database blocks
 * those exact records from being re-created, but nothing stopped a developer
 * from re-adding a sample array here and shipping fresh demo rows. These tests
 * fail loudly if anyone does.
 */
import { describe, expect, it } from "vitest";
import { interactions } from "@/lib/mock-data";

describe("no seeded demo data ships in the product", () => {
  it("the interactions sample array stays empty", () => {
    // Interactions must come from `public.interactions` only. If you are adding
    // fixtures, add them to a test file — not here, where they reach real users.
    expect(interactions).toEqual([]);
  });

  it("carries no placeholder text of the kind that previously reached production", () => {
    const suspicious = /just testing|lorem ipsum|test test|asdf|dummy data/i;
    const offenders = interactions.filter((i) =>
      suspicious.test(`${(i as { notes?: string }).notes ?? ""}`),
    );
    expect(offenders).toEqual([]);
  });
});
