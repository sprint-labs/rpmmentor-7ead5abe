/**
 * The goalkeeper dossier: one printable document built from what the profile
 * already knows.
 *
 * A mentor asked for a goalkeeper's profile on a page they can hand to a club,
 * read on screen and keep as a PDF. Nothing here is new data — it is the same
 * roster row, the same Match Reports and the same logged interactions the
 * profile renders, arranged as a document and frozen at a moment in time.
 *
 * The build is pure on purpose. The HTML view and the PDF export both render
 * this one model, so a dossier read on screen and the same dossier on paper
 * cannot disagree, and the arithmetic below is testable without a browser.
 *
 * Two rules are copied deliberately from `/goalkeepers/$gkId` rather than
 * re-invented:
 *
 *  - **Average rating** is the mean of every report average that is a valid
 *    1–5, rounded to one decimal. A report with no average does not drag it
 *    down; it simply does not contribute.
 *  - **Pillar averages** come from the five most recent reports only, the same
 *    window the profile's Skill Scores panel uses. A dossier that averaged a
 *    whole career would contradict the page it was exported from.
 *
 * Matching reports and interactions to the goalkeeper stays with the caller,
 * which already resolves both against the canonical roster row (apostrophes
 * and all — see `normalisePersonName`). This module never guesses identity.
 */
import { formatDate, type Goalkeeper } from "@/lib/mock-data";
import { formatDobDisplay } from "@/lib/dob-format";
import { formatContractExpiry } from "@/lib/contract-expiry";
import type { LoggedInteraction } from "@/lib/interactions/schema";
import {
  PILLAR_IDS,
  PILLAR_LABELS,
  type MatchReportRow,
  type PillarId,
} from "@/lib/match-reports/schema";
import { SEASON_STAT_ROWS, type GoalkeeperSeasonStats } from "@/lib/goalkeeper-season-stats";

/** The window the profile's Skill Scores panel averages, kept in step with it. */
export const DOSSIER_PILLAR_WINDOW = 5;

/** How many reports and interactions the document itself lists. */
export const DOSSIER_RECENT_LIMIT = 6;

export interface DossierFact {
  label: string;
  value: string;
}

export interface DossierPillar {
  id: PillarId;
  label: string;
  /** Mean of the valid 1–5 scores in the window, or null when none are. */
  score: number | null;
  /** How many reports in the window carried a valid score for this pillar. */
  reports: number;
}

export interface DossierReport {
  id: string;
  date: string | null;
  dateLabel: string;
  fixture: string;
  competition: string;
  coach: string;
  average: number | null;
  averageLabel: string;
  comments: string;
}

export interface DossierInteraction {
  id: string;
  dateLabel: string;
  type: string;
  mentor: string;
  outcome: string;
  notes: string;
  followUp: string;
}

export interface DossierSeasonStats {
  seasonLabel: string;
  rows: DossierFact[];
}

export interface GoalkeeperDossier {
  /** Stable, filename-safe id for this goalkeeper's dossier. */
  slug: string;
  name: string;
  initials: string;
  profileImage: string | null;
  /** "Birmingham City (on loan from Brighton & Hove Albion)" when on loan. */
  clubLine: string;
  league: string;
  tier: string | null;
  tags: string[];
  /** ISO timestamp the document was built at — printed on every copy. */
  generatedAt: string;
  generatedAtLabel: string;
  headline: {
    averageRating: number | null;
    averageRatingLabel: string;
    reportsTotal: number;
    interactionsTotal: number;
    recommendation: string;
  };
  facts: DossierFact[];
  biography: string | null;
  developmentPlan: string[];
  seasonStats: DossierSeasonStats | null;
  pillars: DossierPillar[];
  /** The pillar window actually used — fewer than five when that is all there is. */
  pillarWindowSize: number;
  reports: DossierReport[];
  interactions: DossierInteraction[];
}

/** Inclusive 1–5 finite numeric guard, as on the profile. */
function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
}

function meanToOneDecimal(values: readonly number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(mean * 10) / 10;
}

function ratingLabel(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}/5`;
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function fixtureLine(report: MatchReportRow): string {
  const team = text(report.team);
  const opponent = text(report.opponent);
  if (team && opponent) return `${team} v ${opponent}`;
  if (opponent) return `v ${opponent}`;
  if (team) return team;
  return "Fixture not recorded";
}

function seasonStatRows(stats: GoalkeeperSeasonStats): DossierFact[] {
  return SEASON_STAT_ROWS.map(({ key, label }) => {
    const value = stats[key];
    return {
      label,
      value: typeof value === "number" ? value.toLocaleString("en-GB") : String(value ?? "—"),
    };
  });
}

/**
 * The facts block — the same eight the profile shows above its panels, plus the
 * loan parent club, which a document handed to somebody else cannot leave out.
 */
function factsFor(gk: Goalkeeper): DossierFact[] {
  const facts: DossierFact[] = [
    { label: "Date of birth", value: formatDobDisplay(gk.dob) },
    { label: "Age", value: gk.age != null ? String(gk.age) : "Not recorded" },
    { label: "Nationality", value: text(gk.nationality) || "—" },
    { label: "Height", value: text(gk.height) || "—" },
    { label: "Shirt number", value: gk.shirtNumber != null ? String(gk.shirtNumber) : "—" },
    { label: "Preferred foot", value: text(gk.foot) || "—" },
    { label: "Contract until", value: formatContractExpiry(text(gk.contractUntil) || "—") },
    { label: "League", value: text(gk.league) || "—" },
  ];
  const parent = text(gk.parentClub);
  if (gk.onLoan && parent) facts.push({ label: "Parent club", value: parent });
  return facts;
}

function clubLineFor(gk: Goalkeeper): string {
  if (gk.tags.includes("Free Agent")) return "Free Agent";
  const club = text(gk.club);
  const parent = text(gk.parentClub);
  if (!club) return "Club not recorded";
  if (gk.onLoan && parent && parent !== club) return `${club} (on loan from ${parent})`;
  return club;
}

export interface BuildGoalkeeperDossierInput {
  gk: Goalkeeper;
  /** Reports already resolved to this goalkeeper, newest first. */
  reports?: readonly MatchReportRow[];
  /** Interactions already resolved to this goalkeeper, newest first. */
  interactions?: readonly LoggedInteraction[];
  /** Fixed for tests; defaults to now. */
  generatedAt?: Date;
  /** How many reports and interactions the document lists. */
  recentLimit?: number;
}

/**
 * Build the document. Every string it returns is display-ready, so neither the
 * HTML view nor the PDF writer has to re-decide how a missing value reads.
 */
export function buildGoalkeeperDossier({
  gk,
  reports = [],
  interactions = [],
  generatedAt = new Date(),
  recentLimit = DOSSIER_RECENT_LIMIT,
}: BuildGoalkeeperDossierInput): GoalkeeperDossier {
  const window = reports.slice(0, DOSSIER_PILLAR_WINDOW);
  const averageRating = meanToOneDecimal(reports.map((r) => r.average).filter(isValidScore));

  const pillars: DossierPillar[] = PILLAR_IDS.map((id) => {
    const values = window.map((r) => r.scores[id]).filter(isValidScore);
    return {
      id,
      label: PILLAR_LABELS[id],
      score: meanToOneDecimal(values),
      reports: values.length,
    };
  });

  return {
    slug: gk.id,
    name: gk.name,
    initials: gk.initials,
    profileImage: text(gk.profileImage) || null,
    clubLine: clubLineFor(gk),
    league: text(gk.league) || "—",
    tier: gk.tier ?? null,
    tags: [...gk.tags],
    generatedAt: generatedAt.toISOString(),
    generatedAtLabel: formatDate(generatedAt.toISOString()),
    headline: {
      averageRating,
      averageRatingLabel: ratingLabel(averageRating),
      reportsTotal: reports.length,
      interactionsTotal: interactions.length,
      recommendation: gk.recommendation,
    },
    facts: factsFor(gk),
    biography: text(gk.bio) || null,
    developmentPlan: (gk.developmentPlan ?? []).map(text).filter(Boolean),
    seasonStats: gk.seasonStats
      ? { seasonLabel: gk.seasonStats.seasonLabel, rows: seasonStatRows(gk.seasonStats) }
      : null,
    pillars,
    pillarWindowSize: window.length,
    reports: reports.slice(0, recentLimit).map((r) => ({
      id: r.report_id,
      date: r.match_date,
      dateLabel: r.match_date ? formatDate(r.match_date) : "Date not recorded",
      fixture: fixtureLine(r),
      competition: text(r.competition) || "—",
      coach: text(r.coach) || "—",
      average: isValidScore(r.average) ? r.average : null,
      averageLabel: ratingLabel(isValidScore(r.average) ? r.average : null),
      comments: text(r.comments),
    })),
    interactions: interactions.slice(0, recentLimit).map((i) => ({
      id: i.id,
      dateLabel: i.occurredAt ? formatDate(i.occurredAt) : "Date not recorded",
      type: text(i.interactionType) || "Interaction",
      mentor: text(i.mentorName) || "—",
      outcome: text(i.outcome) || "—",
      notes: text(i.notes),
      followUp: text(i.followUp),
    })),
  };
}

/**
 * The download name. Dated so a mentor who exports the same goalkeeper twice in
 * a season ends up with two files rather than one overwriting the other.
 */
export function dossierFilename(dossier: GoalkeeperDossier, extension = "pdf"): string {
  const name =
    dossier.name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "goalkeeper";
  const day = dossier.generatedAt.slice(0, 10);
  return `${name}-dossier-${day}.${extension}`;
}
