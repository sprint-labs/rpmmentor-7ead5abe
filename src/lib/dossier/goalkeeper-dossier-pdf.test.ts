// @vitest-environment jsdom

/**
 * The PDF writer is exercised for real — jsPDF included — because the failure
 * it is worth catching is a writer that throws or produces an empty file, and
 * only actually rendering one finds that.
 */
import { describe, expect, it } from "vitest";
import { buildGoalkeeperDossier } from "@/lib/dossier/goalkeeper-dossier";
import { renderGoalkeeperDossierPdf } from "@/lib/dossier/goalkeeper-dossier-pdf";
import { goalkeepers } from "@/lib/mock-data";
import { PILLAR_IDS, type MatchReportRow, type PillarId } from "@/lib/match-reports/schema";

const BEADLE = goalkeepers.find((gk) => gk.name === "James Beadle")!;

const REPORT: MatchReportRow = {
  report_id: "mr2_beadle_1",
  legacy_report_id: "mr_beadle_1",
  row_index: 1,
  goalkeeper: BEADLE.name,
  coach: "A Coach",
  team: "Birmingham City",
  opponent: "Barnsley",
  competition: "EFL Championship",
  match_date: "2026-09-01",
  scores: Object.fromEntries(PILLAR_IDS.map((id) => [id, 4])) as Record<PillarId, number | null>,
  average: 4,
  comments: "Commanded his box all afternoon.",
};

describe("renderGoalkeeperDossierPdf", () => {
  it("renders a real PDF named after the goalkeeper and the day", async () => {
    const dossier = buildGoalkeeperDossier({
      gk: BEADLE,
      reports: [REPORT],
      generatedAt: new Date("2026-09-28T09:30:00.000Z"),
    });

    const { blob, filename } = await renderGoalkeeperDossierPdf(dossier);

    expect(filename).toBe("james-beadle-dossier-2026-09-28.pdf");
    expect(blob.type).toBe("application/pdf");
    const head = new Uint8Array(await blob.arrayBuffer());
    // A PDF starts "%PDF"; an empty or failed render would not.
    expect(String.fromCharCode(...head.slice(0, 4))).toBe("%PDF");
    expect(head.byteLength).toBeGreaterThan(2000);
  });

  it("renders a goalkeeper with no reports, interactions or narrative", async () => {
    const bare = buildGoalkeeperDossier({
      gk: { ...BEADLE, bio: undefined, developmentPlan: [], seasonStats: undefined },
    });

    const { blob } = await renderGoalkeeperDossierPdf(bare);

    expect(blob.size).toBeGreaterThan(0);
  });
});
