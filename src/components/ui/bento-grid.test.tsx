// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BENTO_SPAN, BentoCell, BentoGrid, bentoSpan, type BentoSize } from "./bento-grid";

afterEach(() => {
  cleanup();
});

const SIZES: BentoSize[] = ["list", "detail", "matrix"];

/** Class order is twMerge's business; what a panel renders as is the set. */
const classSet = (s: string) => new Set(s.trim().split(/\s+/));

describe("bentoSpan", () => {
  it("renders the same class set the dashboard panels carry today", () => {
    // Duty of Care, as hand-spanned in src/routes/index.tsx before this primitive.
    expect(classSet(bentoSpan("list", "command-panel p-4 sm:p-5"))).toEqual(
      classSet("col-span-12 self-start command-panel p-4 sm:p-5 lg:col-span-4"),
    );

    // GoalkeeperDistribution, as hand-spanned on its own root.
    expect(classSet(bentoSpan("list", "command-panel p-4"))).toEqual(
      classSet("col-span-12 self-start command-panel p-4 lg:col-span-4"),
    );
  });

  it("guarantees full width on mobile and content height at every size", () => {
    for (const size of SIZES) {
      const classes = classSet(BENTO_SPAN[size]);
      // Mobile-first: one column until the lg switch.
      expect(classes.has("col-span-12")).toBe(true);
      // The content-height guarantee — without it every empty state stretches.
      expect(classes.has("self-start")).toBe(true);
      // Height is never declared: no row-span, no fixed height, no scroll.
      for (const c of classes) {
        expect(c).not.toMatch(/^(lg:)?row-span-/);
        expect(c).not.toMatch(/^(h-|min-h-|max-h-|overflow-)/);
      }
    }
  });

  it("caps only the matrix token, because only it pays for width in height", () => {
    expect(BENTO_SPAN.matrix).toContain("max-w-[640px]");
    expect(BENTO_SPAN.list).not.toContain("max-w-");
    expect(BENTO_SPAN.detail).not.toContain("max-w-");
  });

  it("replaces a span within one breakpoint tier and adds across tiers", () => {
    // Same modifier scope: the token's own lg span loses.
    expect(bentoSpan("detail", "lg:col-span-7")).toBe("col-span-12 self-start lg:col-span-7");
    // Different scope: both survive, so adding a tier is additive.
    expect(classSet(bentoSpan("list", "md:col-span-6"))).toEqual(
      classSet("col-span-12 self-start lg:col-span-4 md:col-span-6"),
    );
  });
});

describe("BentoCell", () => {
  it("is the panel itself, not a wrapper around it", () => {
    const { container } = render(
      <BentoCell size="list" className="command-panel p-4">
        panel body
      </BentoCell>,
    );

    expect(container.childElementCount).toBe(1);
    const cell = container.firstElementChild as HTMLElement;
    expect(cell.className).toContain("lg:col-span-4");
    expect(cell.className).toContain("command-panel");
    expect(cell.textContent).toBe("panel body");
  });

  it("can render as a landmark and passes attributes through", () => {
    const { container } = render(
      <BentoCell size="detail" as="section" aria-labelledby="fixtures-heading">
        body
      </BentoCell>,
    );

    const cell = container.firstElementChild as HTMLElement;
    expect(cell.tagName).toBe("SECTION");
    expect(cell.getAttribute("aria-labelledby")).toBe("fixtures-heading");
  });
});

describe("BentoGrid", () => {
  it("lays out twelve columns whose rows never absorb free space", () => {
    const { container } = render(<BentoGrid>cells</BentoGrid>);

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-12");
    expect(grid.className).toContain("auto-rows-min");
    expect(grid.className).toContain("gap-4");
  });

  it("can render as a labelled region", () => {
    const { container } = render(
      <BentoGrid as="section" aria-labelledby="ops-heading">
        cells
      </BentoGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.tagName).toBe("SECTION");
    expect(grid.getAttribute("aria-labelledby")).toBe("ops-heading");
  });
});
