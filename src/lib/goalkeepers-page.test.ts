import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  fileURLToPath(new URL("../routes/goalkeepers.tsx", import.meta.url)),
  "utf8",
);
const primitivesSource = readFileSync(
  fileURLToPath(new URL("../components/primitives.tsx", import.meta.url)),
  "utf8",
);
const dashboardSource = readFileSync(
  fileURLToPath(new URL("../routes/index.tsx", import.meta.url)),
  "utf8",
);

describe("Goalkeepers page filter composition", () => {
  it("removes only the four Goalkeepers summary cards while retaining shared duty-of-care consumers", () => {
    expect(pageSource).not.toContain("StatCard");
    expect(pageSource).not.toContain("Total Under Care");
    expect(pageSource).not.toContain('label="Up to date"');
    expect(pageSource).not.toContain('label="Due soon"');
    expect(pageSource).not.toContain('label="Overdue"');
    expect(pageSource).toContain("<DutyBadge");
    expect(primitivesSource).toContain("export function StatCard");
    expect(dashboardSource).toContain("dutyOverview");
  });

  it("keeps search prominent and uses an accessible mobile bottom drawer", () => {
    expect(pageSource).toContain('aria-label="Search goalkeepers"');
    expect(pageSource).toContain("<Drawer");
    expect(pageSource).toContain("<DrawerTrigger asChild>");
    expect(pageSource).toContain("<DrawerClose asChild>");
    expect(pageSource).toContain(
      'aria-label={activeFilters ? `Filters, ${activeFilters} active` : "Filters"}',
    );
    expect(pageSource).toContain("aria-expanded={mobileAdvOpen}");
    expect(pageSource).toContain("aria-pressed={selected}");
  });

  it("uses individual mobile tier controls and keeps advanced filters collapsed initially", () => {
    expect(pageSource).toContain(
      'const TIER_OPTIONS: TierLevelLabel[] = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"]',
    );
    expect(pageSource).toMatch(
      /<TierFilterOptions\s+selectedTiers=\{selectedTiers\}\s+update=\{update\}\s+showLabel=\{false\}/,
    );
    expect(pageSource).toContain("const [mobileAdvOpen, setMobileAdvOpen] = useState(false)");
    expect(pageSource).toContain("const [advOpen, setAdvOpen] = useState(false)");
  });

  it("keeps the mobile layout compact and confines desktop-only controls to the desktop breakpoint", () => {
    expect(pageSource).toContain('className="flex w-full items-center justify-between gap-2 md:hidden"');
    expect(pageSource).toContain('className="hidden w-full items-center gap-2 md:flex md:flex-wrap"');
    expect(pageSource).toContain('className="h-[calc(100dvh-1rem)] max-h-[42rem]"');
    expect(pageSource).toContain('className="divide-y divide-border md:hidden"');
    expect(pageSource).toContain('className="hidden overflow-x-auto md:block"');
    expect(pageSource).toContain('aria-label="Close filters"');
  });
});
