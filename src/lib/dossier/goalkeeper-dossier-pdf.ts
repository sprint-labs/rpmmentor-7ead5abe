/**
 * The dossier on paper.
 *
 * Written straight into jsPDF rather than screenshotting the HTML view: a
 * rasterised page is unsearchable, four times the size, and comes out of the
 * browser at whatever the viewport happened to be. Both outputs render the same
 * `GoalkeeperDossier`, so the document is the same document either way.
 *
 * jsPDF is imported dynamically — it is a large dependency, and a mentor who
 * never exports a dossier should never download it. `exportConflictPdf` in
 * `src/components/workflows.tsx` does the same thing for the same reason.
 *
 * Colours are the print theme's, not the screen theme's: GK Green deep for
 * headings and near-black body text on white, so a dossier printed from a dark
 * screen does not arrive as a black rectangle.
 */
import {
  dossierFilename,
  type DossierFact,
  type GoalkeeperDossier,
} from "@/lib/dossier/goalkeeper-dossier";

type Rgb = [number, number, number];

/** `--gk-green-deep`, the print theme's one accent. */
const ACCENT: Rgb = [26, 92, 46];
const INK: Rgb = [20, 20, 20];
const MUTED: Rgb = [90, 90, 88];
const RULE = 200;

export interface DossierPdfDocument {
  /** The bytes, ready to download. */
  blob: Blob;
  filename: string;
}

/** Hand a blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Render the dossier and return the PDF. Separated from the download so a test
 * can assert on the bytes, and so a future email/attach path can reuse it.
 */
export async function renderGoalkeeperDossierPdf(
  dossier: GoalkeeperDossier,
): Promise<DossierPdfDocument> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const line = (
    value: string,
    opts?: { size?: number; bold?: boolean; color?: Rgb; indent?: number },
  ) => {
    const size = opts?.size ?? 10;
    const indent = opts?.indent ?? 0;
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const [r, g, b] = opts?.color ?? INK;
    doc.setTextColor(r, g, b);
    const lineH = size * 1.3;
    for (const wrapped of doc.splitTextToSize(value, contentW - indent) as string[]) {
      ensureRoom(lineH);
      doc.text(wrapped, margin + indent, y);
      y += lineH;
    }
  };

  const gap = (h = 8) => {
    y += h;
  };

  const rule = (color = RULE) => {
    ensureRoom(10);
    doc.setDrawColor(color);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  };

  const heading = (value: string) => {
    gap(6);
    ensureRoom(26);
    line(value.toUpperCase(), { size: 11, bold: true, color: ACCENT });
    rule();
  };

  /** Two label/value columns — the shape every fact block in the document uses. */
  const factGrid = (facts: readonly DossierFact[]) => {
    const colW = contentW / 2;
    for (let i = 0; i < facts.length; i += 2) {
      const row = facts.slice(i, i + 2);
      ensureRoom(26);
      row.forEach((fact, col) => {
        const x = margin + col * colW;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(fact.label.toUpperCase(), x, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        doc.text(fact.value, x, y + 12);
      });
      y += 28;
    }
  };

  // ── Masthead ──
  line(dossier.name, { size: 22, bold: true });
  gap(2);
  line([dossier.clubLine, dossier.league].filter(Boolean).join("  ·  "), {
    size: 10,
    color: MUTED,
  });
  const badges = [dossier.tier, ...dossier.tags].filter((v): v is string => Boolean(v));
  if (badges.length) line(badges.join("  ·  "), { size: 9, color: ACCENT, bold: true });
  gap(2);
  line(`Goalkeeper dossier — generated ${dossier.generatedAtLabel} · Mentor Hub by RPM`, {
    size: 8,
    color: MUTED,
  });
  gap(4);
  rule(150);

  // ── Headline numbers ──
  factGrid([
    { label: "Average rating", value: dossier.headline.averageRatingLabel },
    { label: "Recommendation", value: dossier.headline.recommendation },
    { label: "Match reports", value: String(dossier.headline.reportsTotal) },
    { label: "Logged interactions", value: String(dossier.headline.interactionsTotal) },
  ]);

  heading("Profile");
  factGrid(dossier.facts);

  if (dossier.biography) {
    heading("Biography");
    line(dossier.biography, { size: 10 });
  }

  if (dossier.developmentPlan.length) {
    heading("Development plan");
    for (const item of dossier.developmentPlan) line(`•  ${item}`, { size: 10, indent: 4 });
  }

  if (dossier.seasonStats) {
    heading(`Season stats — ${dossier.seasonStats.seasonLabel}`);
    factGrid(dossier.seasonStats.rows);
  }

  heading("Skill scores");
  line(
    dossier.pillarWindowSize
      ? `Mean of the ${dossier.pillarWindowSize} most recent Match Report${dossier.pillarWindowSize === 1 ? "" : "s"}.`
      : "No Match Reports scored yet.",
    { size: 8, color: MUTED },
  );
  gap(4);
  for (const pillar of dossier.pillars) {
    ensureRoom(16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(pillar.label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(pillar.score == null ? "—" : `${pillar.score.toFixed(1)}/5`, pageW - margin, y, {
      align: "right",
    });
    y += 14;
  }

  heading(`Recent match reports (${dossier.reports.length} of ${dossier.headline.reportsTotal})`);
  if (!dossier.reports.length) {
    line("No Match Reports on file.", { size: 9, color: MUTED });
  } else {
    for (const report of dossier.reports) {
      ensureRoom(30);
      line(`${report.dateLabel} — ${report.fixture}`, { size: 10, bold: true });
      line(
        [
          `Competition: ${report.competition}`,
          `Coach: ${report.coach}`,
          `Average: ${report.averageLabel}`,
        ].join(" · "),
        { size: 8, color: MUTED, indent: 4 },
      );
      if (report.comments) line(report.comments, { size: 9, indent: 4 });
      gap(4);
    }
  }

  heading(
    `Recent interactions (${dossier.interactions.length} of ${dossier.headline.interactionsTotal})`,
  );
  if (!dossier.interactions.length) {
    line("No interactions logged.", { size: 9, color: MUTED });
  } else {
    for (const interaction of dossier.interactions) {
      ensureRoom(30);
      line(`${interaction.dateLabel} — ${interaction.type}`, { size: 10, bold: true });
      line(`Mentor: ${interaction.mentor} · Outcome: ${interaction.outcome}`, {
        size: 8,
        color: MUTED,
        indent: 4,
      });
      if (interaction.notes) line(interaction.notes, { size: 9, indent: 4 });
      if (interaction.followUp) line(`Follow-up: ${interaction.followUp}`, { size: 9, indent: 4 });
      gap(4);
    }
  }

  // Footer on every page, so a loose sheet still says who it is about and when
  // it was true.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `${dossier.name} · Goalkeeper dossier · generated ${dossier.generatedAtLabel}`,
      margin,
      pageH - 22,
    );
    doc.text(`${page} / ${pages}`, pageW - margin, pageH - 22, { align: "right" });
  }

  return { blob: doc.output("blob"), filename: dossierFilename(dossier) };
}

/** Render and download in one step — what the buttons call. */
export async function exportGoalkeeperDossierPdf(dossier: GoalkeeperDossier): Promise<string> {
  const { blob, filename } = await renderGoalkeeperDossierPdf(dossier);
  downloadBlob(blob, filename);
  return filename;
}
