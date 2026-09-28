import { describe, expect, it } from "vitest";
import {
  buildGoalkeeperDossier,
  dossierFilename,
  DOSSIER_PILLAR_WINDOW,
} from "@/lib/dossier/goalkeeper-dossier";
import { formatDate, goalkeepers, type Goalkeeper } from "@/lib/mock-data";
import type { LoggedInteraction } from "@/lib/interactions/schema";
import { PILLAR_IDS, type MatchReportRow, type PillarId } from "@/lib/match-reports/schema";

const BEADLE = goalkeepers.find((gk) => gk.name === "James Beadle")!;
const GENERATED_AT = new Date("2026-09-28T09:30:00.000Z");

function report(overrides: Partial<MatchReportRow> & { report_id: string }): MatchReportRow {
  const scores = Object.fromEntries(PILLAR_IDS.map((id) => [id, 4])) as Record<
    PillarId,
    number | null
  >;
  return {
    legacy_report_id: overrides.report_id,
    row_index: null,
    goalkeeper: BEADLE.name,
    coach: "A Coach",
    team: "Birmingham City",
    opponent: "Barnsley",
    competition: "EFL Championship",
    match_date: "2026-09-01",
    scores,
    average: 4,
    comments: "",
    ...overrides,
  };
}

function interaction(overrides: Partial<LoggedInteraction> & { id: string }): LoggedInteraction {
  return {
    gkSlug: BEADLE.id,
    goalkeeperName: BEADLE.name,
    playerId: null,
    mentorId: "mentor-1",
    mentorName: "A Mentor",
    interactionType: "Live Match Observation",
    club: "Birmingham City",
    occurredAt: "2026-09-10",
    notes: "Watched the full 90.",
    outcome: "On track",
    followUp: "",
    createdAt: "2026-09-10T18:00:00.000Z",
    matchReportId: null,
    calendarEventId: null,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

describe("buildGoalkeeperDossier", () => {
  it("names the loan parent club in the club line and the facts", () => {
    const dossier = buildGoalkeeperDossier({ gk: BEADLE, generatedAt: GENERATED_AT });

    expect(dossier.name).toBe("James Beadle");
    expect(dossier.clubLine).toBe("Birmingham City (on loan from Brighton & Hove Albion)");
    expect(dossier.facts).toEqual(
      expect.arrayContaining([
        { label: "Parent club", value: "Brighton & Hove Albion" },
        // Month and year, as the profile shows it — not the ISO month-end the
        // roster conversion picked.
        { label: "Contract until", value: "June 2028" },
      ]),
    );
  });

  it("reads Free Agent off the tags rather than the club column", () => {
    const freeAgent: Goalkeeper = { ...BEADLE, tags: ["Free Agent"], club: "" };

    expect(buildGoalkeeperDossier({ gk: freeAgent }).clubLine).toBe("Free Agent");
  });

  it("averages every valid report average and ignores the ones with none", () => {
    const dossier = buildGoalkeeperDossier({
      gk: BEADLE,
      reports: [
        report({ report_id: "a", average: 4 }),
        report({ report_id: "b", average: 3 }),
        report({ report_id: "c", average: null }),
      ],
      generatedAt: GENERATED_AT,
    });

    expect(dossier.headline.averageRating).toBe(3.5);
    expect(dossier.headline.averageRatingLabel).toBe("3.5/5");
    // The count is every report on file, not just the ones that scored.
    expect(dossier.headline.reportsTotal).toBe(3);
  });

  it("reads '—' rather than a number when no report carries a valid average", () => {
    const dossier = buildGoalkeeperDossier({
      gk: BEADLE,
      reports: [report({ report_id: "a", average: null })],
    });

    expect(dossier.headline.averageRating).toBeNull();
    expect(dossier.headline.averageRatingLabel).toBe("—");
  });

  it("averages pillars over the five most recent reports only, as the profile does", () => {
    // Six reports: the five most recent score 5, the sixth scores 1. A career
    // average would read 4.3; the profile's window reads 5.0.
    const reports = [
      ...Array.from({ length: DOSSIER_PILLAR_WINDOW }, (_, i) =>
        report({
          report_id: `recent-${i}`,
          scores: Object.fromEntries(PILLAR_IDS.map((id) => [id, 5])) as Record<
            PillarId,
            number | null
          >,
        }),
      ),
      report({
        report_id: "old",
        scores: Object.fromEntries(PILLAR_IDS.map((id) => [id, 1])) as Record<
          PillarId,
          number | null
        >,
      }),
    ];

    const dossier = buildGoalkeeperDossier({ gk: BEADLE, reports });

    expect(dossier.pillarWindowSize).toBe(DOSSIER_PILLAR_WINDOW);
    for (const pillar of dossier.pillars) {
      expect(pillar.score).toBe(5);
      expect(pillar.reports).toBe(DOSSIER_PILLAR_WINDOW);
    }
  });

  it("leaves a pillar unscored rather than scoring it zero when nothing valid exists", () => {
    const dossier = buildGoalkeeperDossier({
      gk: BEADLE,
      reports: [
        report({
          report_id: "a",
          scores: {
            ...(Object.fromEntries(PILLAR_IDS.map((id) => [id, 4])) as Record<
              PillarId,
              number | null
            >),
            psych: null,
          },
        }),
      ],
    });

    const psych = dossier.pillars.find((p) => p.id === "psych")!;
    expect(psych.score).toBeNull();
    expect(psych.reports).toBe(0);
  });

  it("lists only the most recent reports and interactions, and says how many there are in all", () => {
    const dossier = buildGoalkeeperDossier({
      gk: BEADLE,
      reports: Array.from({ length: 9 }, (_, i) => report({ report_id: `r-${i}` })),
      interactions: Array.from({ length: 4 }, (_, i) => interaction({ id: `i-${i}` })),
      recentLimit: 2,
    });

    expect(dossier.reports).toHaveLength(2);
    expect(dossier.reports.map((r) => r.id)).toEqual(["r-0", "r-1"]);
    expect(dossier.headline.reportsTotal).toBe(9);
    expect(dossier.interactions).toHaveLength(2);
    expect(dossier.headline.interactionsTotal).toBe(4);
  });

  it("says a fixture is not recorded rather than printing an empty line", () => {
    const dossier = buildGoalkeeperDossier({
      gk: BEADLE,
      reports: [report({ report_id: "a", team: null, opponent: null, match_date: null })],
    });

    expect(dossier.reports[0].fixture).toBe("Fixture not recorded");
    expect(dossier.reports[0].dateLabel).toBe("Date not recorded");
  });

  it("stamps the document with the moment it was built", () => {
    const dossier = buildGoalkeeperDossier({ gk: BEADLE, generatedAt: GENERATED_AT });

    expect(dossier.generatedAt).toBe("2026-09-28T09:30:00.000Z");
    // Formatted by the app's own `formatDate`, so the label cannot drift from
    // every other date in the product (or from the host's month abbreviation).
    expect(dossier.generatedAtLabel).toBe(formatDate("2026-09-28T09:30:00.000Z"));
  });
});

describe("dossierFilename", () => {
  it("dates the file so two exports in a season do not overwrite each other", () => {
    const dossier = buildGoalkeeperDossier({ gk: BEADLE, generatedAt: GENERATED_AT });

    expect(dossierFilename(dossier)).toBe("james-beadle-dossier-2026-09-28.pdf");
  });

  it("folds punctuation and accents out of a name", () => {
    const dossier = buildGoalkeeperDossier({
      gk: { ...BEADLE, name: "Rich O'Donnell" },
      generatedAt: GENERATED_AT,
    });

    expect(dossierFilename(dossier)).toBe("rich-o-donnell-dossier-2026-09-28.pdf");
  });
});
