// Roster data quality checker.
// Flags missing or inconsistent goalkeeper roster fields so mentors can
// clean up the dataset before it powers downstream analytics.

import type { Goalkeeper } from "./mock-data";

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCode =
  | "missing_nationality"
  | "missing_club"
  | "missing_league"
  | "missing_parent_club"
  | "missing_contract"
  | "unparseable_contract"
  | "contract_expired"
  | "contract_expiring_soon"
  | "loan_parent_matches_club"
  | "parent_club_without_loan_flag"
  | "free_agent_with_club"
  | "club_without_free_agent_status"
  | "missing_dob"
  | "age_dob_mismatch"
  | "missing_profile_image";

/**
 * The checks that need a column `public.players` does not have.
 *
 * Date of birth, age, height, shirt number, preferred foot and portrait are
 * quarantined in `roster/seed-presentation.ts`: the live roster carries them
 * from the seed snapshot, so a goalkeeper signed since that snapshot has none
 * of them. Running these against the live roster would flag most of the roster
 * for "missing date of birth" — true, and useless, because there is no field
 * for anyone to go and fill in. They are reported as one aggregate count
 * instead. Delete this split once the columns exist.
 */
export const NOT_CAPTURED_CODES = [
  "missing_dob",
  "age_dob_mismatch",
  "missing_profile_image",
] as const satisfies readonly IssueCode[];

/** The six fields behind `NOT_CAPTURED_CODES`, in the order the page lists them. */
export const NOT_CAPTURED_FIELDS = [
  "date of birth",
  "age",
  "height",
  "shirt number",
  "preferred foot",
  "portrait",
] as const;

const NOT_CAPTURED: ReadonlySet<IssueCode> = new Set(NOT_CAPTURED_CODES);

/** True for a check `public.players` can answer on its own today. */
export function isDatabaseBacked(code: IssueCode): boolean {
  return !NOT_CAPTURED.has(code);
}

export interface AuditOptions {
  /**
   * Drop `NOT_CAPTURED_CODES` from the result. The live roster audit sets this,
   * so the page reports one "not captured in the database yet" count rather
   * than the same unfixable issue against every goalkeeper.
   */
  databaseBackedOnly?: boolean;
}

export interface RosterIssue {
  code: IssueCode;
  severity: IssueSeverity;
  field: string;
  message: string;
}

export interface GoalkeeperQualityReport {
  gk: Goalkeeper;
  issues: RosterIssue[];
  score: number; // 0-100, 100 = perfect
}

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/**
 * A local `Date` for a calendar day, or null when the parts are not a real one.
 * `new Date(2027, 1, 31)` silently becomes 3 March, so the round trip is
 * checked rather than trusted — a nonsense date should fail the check, not
 * quietly report the wrong month.
 */
function calendarDate(year: number, monthIndex: number, day: number): Date | null {
  const date = new Date(year, monthIndex, day);
  const survived =
    date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day;
  return survived ? date : null;
}

/**
 * Parse a contract end date, or null when it cannot be read.
 *
 * Two forms reach this. `Goalkeeper.contractUntil` is ISO, because `contractISO`
 * converts the stored value on the way into the view model, while
 * `players.contract_until` and the club-corrections form both still hold the
 * "June 2027" month-and-year form. Reading both means the check gives the same
 * answer wherever the value came from.
 */
export function parseContractDate(input: string | undefined | null): Date | null {
  const raw = input?.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const monthYear = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!monthYear) return null;
  const month = MONTHS[monthYear[1].toLowerCase()];
  const year = Number(monthYear[2]);
  if (month === undefined || !Number.isFinite(year)) return null;
  // End of month
  return new Date(year, month + 1, 0);
}

/**
 * Parse a date of birth, or null when it cannot be read.
 *
 * `Goalkeeper.dob` is ISO: `mock-data` converts the seed's `dd/mm/yyyy` on the
 * way out, and every consumer since has assumed `yyyy-mm-dd`. This accepted
 * only the pre-conversion form, so the DOB check failed for the entire roster.
 * ISO is canonical now; `dd/mm/yyyy` stays readable so a hand-typed value is
 * not rejected.
 */
export function parseDob(input: string | undefined | null): Date | null {
  const raw = input?.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return calendarDate(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  return null;
}

function ageFromDob(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const EXPIRING_DAYS = 90;

export function checkGoalkeeper(
  gk: Goalkeeper,
  now: Date = new Date(),
  options: AuditOptions = {},
): RosterIssue[] {
  const issues: RosterIssue[] = [];
  // Free Agent is its own attribute now, not a value the tier column holds,
  // so it is read from the tags rather than from the tier.
  const isFreeAgent = gk.tags.includes("Free Agent");

  if (!gk.nationality?.trim()) {
    issues.push({
      code: "missing_nationality",
      severity: "error",
      field: "nationality",
      message: "Nationality is missing.",
    });
  }

  if (!isFreeAgent && !gk.club?.trim()) {
    issues.push({
      code: "missing_club",
      severity: "error",
      field: "club",
      message: "Club is missing.",
    });
  }
  if (!isFreeAgent && !gk.league?.trim()) {
    issues.push({
      code: "missing_league",
      severity: "warning",
      field: "league",
      message: "League is missing.",
    });
  }

  // Free-agent consistency
  if (isFreeAgent && gk.club?.trim() && gk.club.trim().toLowerCase() !== "free agent") {
    issues.push({
      code: "free_agent_with_club",
      severity: "warning",
      field: "club",
      message: `Marked Free Agent but club is "${gk.club}".`,
    });
  }
  const clubLooksFreeAgent = gk.club?.trim().toLowerCase() === "free agent";
  if (!isFreeAgent && clubLooksFreeAgent) {
    issues.push({
      code: "club_without_free_agent_status",
      severity: "warning",
      field: "status",
      message: "Club reads Free Agent but status is not Free Agent.",
    });
  }

  // Parent club / loan consistency (skip for free agents)
  if (!isFreeAgent) {
    const parent = gk.parentClub?.trim();
    if (!parent) {
      issues.push({
        code: "missing_parent_club",
        severity: gk.onLoan ? "error" : "warning",
        field: "parentClub",
        message: gk.onLoan ? "On loan but no parent club recorded." : "Parent club is missing.",
      });
    } else if (gk.onLoan && parent.toLowerCase() === gk.club?.trim().toLowerCase()) {
      issues.push({
        code: "loan_parent_matches_club",
        severity: "warning",
        field: "parentClub",
        message: "On loan but parent club matches current club.",
      });
    } else if (!gk.onLoan && parent.toLowerCase() !== gk.club?.trim().toLowerCase()) {
      issues.push({
        code: "parent_club_without_loan_flag",
        severity: "warning",
        field: "onLoan",
        message: `Parent club "${parent}" differs from club "${gk.club}" but on-loan flag is off.`,
      });
    }
  }

  // Contract
  if (!isFreeAgent) {
    // "—" is how the roster renders "none recorded", so it is a missing
    // contract, not an unreadable one.
    const raw = gk.contractUntil?.trim();
    if (!raw || raw === "—" || raw === "-") {
      issues.push({
        code: "missing_contract",
        severity: "error",
        field: "contractUntil",
        message: "Contract end date is missing.",
      });
    } else {
      const parsed = parseContractDate(raw);
      if (!parsed) {
        issues.push({
          code: "unparseable_contract",
          severity: "warning",
          field: "contractUntil",
          message: `Contract "${raw}" could not be read as a date.`,
        });
      } else {
        const diffMs = parsed.getTime() - now.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          issues.push({
            code: "contract_expired",
            severity: "error",
            field: "contractUntil",
            message: `Contract expired ${-diffDays} day${-diffDays === 1 ? "" : "s"} ago (${raw}).`,
          });
        } else if (diffDays <= EXPIRING_DAYS) {
          issues.push({
            code: "contract_expiring_soon",
            severity: "warning",
            field: "contractUntil",
            message: `Contract expires in ${diffDays} day${diffDays === 1 ? "" : "s"} (${raw}).`,
          });
        }
      }
    }
  }

  // DOB / age
  const dob = parseDob(gk.dob);
  if (!dob) {
    issues.push({
      code: "missing_dob",
      severity: "warning",
      field: "dob",
      message: "Date of birth is missing or malformed.",
    });
  } else if (Number.isFinite(gk.age)) {
    const computed = ageFromDob(dob, now);
    if (Math.abs(computed - gk.age) > 1) {
      issues.push({
        code: "age_dob_mismatch",
        severity: "warning",
        field: "age",
        message: `Recorded age ${gk.age} doesn't match DOB (${computed}).`,
      });
    }
  }

  if (!gk.profileImage?.trim()) {
    issues.push({
      code: "missing_profile_image",
      severity: "info",
      field: "profileImage",
      message: "No profile image on file.",
    });
  }

  // Filtered once at the end rather than guarded at each check, so a new check
  // cannot quietly escape the split by forgetting the guard.
  return options.databaseBackedOnly ? issues.filter((i) => isDatabaseBacked(i.code)) : issues;
}

const SEVERITY_WEIGHT: Record<IssueSeverity, number> = { error: 20, warning: 8, info: 2 };

export function scoreIssues(issues: RosterIssue[]): number {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  return Math.max(0, 100 - penalty);
}

export function auditRoster(
  roster: readonly Goalkeeper[],
  now: Date = new Date(),
  options: AuditOptions = {},
): GoalkeeperQualityReport[] {
  return roster.map((gk) => {
    const issues = checkGoalkeeper(gk, now, options);
    return { gk, issues, score: scoreIssues(issues) };
  });
}

export interface RosterQualitySummary {
  totalGoalkeepers: number;
  goalkeepersWithIssues: number;
  totalIssues: number;
  bySeverity: Record<IssueSeverity, number>;
  byCode: Record<IssueCode, number>;
}

export function summarise(reports: GoalkeeperQualityReport[]): RosterQualitySummary {
  const bySeverity: Record<IssueSeverity, number> = { error: 0, warning: 0, info: 0 };
  const byCode = {} as Record<IssueCode, number>;
  let goalkeepersWithIssues = 0;
  let totalIssues = 0;
  for (const r of reports) {
    if (r.issues.length > 0) goalkeepersWithIssues += 1;
    for (const i of r.issues) {
      totalIssues += 1;
      bySeverity[i.severity] += 1;
      byCode[i.code] = (byCode[i.code] ?? 0) + 1;
    }
  }
  return {
    totalGoalkeepers: reports.length,
    goalkeepersWithIssues,
    totalIssues,
    bySeverity,
    byCode,
  };
}

export const ISSUE_LABEL: Record<IssueCode, string> = {
  missing_nationality: "Missing nationality",
  missing_club: "Missing club",
  missing_league: "Missing league",
  missing_parent_club: "Missing parent club",
  missing_contract: "Missing contract",
  unparseable_contract: "Contract format",
  contract_expired: "Contract expired",
  contract_expiring_soon: "Contract expiring soon",
  loan_parent_matches_club: "Loan / parent club mismatch",
  parent_club_without_loan_flag: "Loan flag inconsistent",
  free_agent_with_club: "Free Agent with club",
  club_without_free_agent_status: "Status vs club mismatch",
  missing_dob: "Missing DOB",
  age_dob_mismatch: "Age / DOB mismatch",
  missing_profile_image: "Missing profile image",
};

export interface Remediation {
  action: string;
  fields: string[];
  hint?: string;
}

export const ISSUE_REMEDIATION: Record<IssueCode, Remediation> = {
  missing_nationality: {
    action: "Add the goalkeeper's nationality on their profile.",
    fields: ["nationality"],
    hint: "Use the country name as it appears on their passport (e.g. England, Republic of Ireland).",
  },
  missing_club: {
    action: "Set the current club, or change status to Free Agent if unsigned.",
    fields: ["club", "status"],
  },
  missing_league: {
    action: "Record the league the current club plays in.",
    fields: ["league"],
    hint: "Use the canonical league name (e.g. Premier League, EFL Championship).",
  },
  missing_parent_club: {
    action: "Add the parent club (the club that holds the contract).",
    fields: ["parentClub", "onLoan"],
    hint: "For non-loan players, parent club should match the current club.",
  },
  missing_contract: {
    action: "Add the contract end date.",
    fields: ["contractUntil"],
    hint: 'Format "Month YYYY" — e.g. "June 2027".',
  },
  unparseable_contract: {
    action: 'Reformat the contract end date as "Month YYYY".',
    fields: ["contractUntil"],
    hint: 'Club corrections stores "June 2027"; a full ISO date (2027-06-30) is also read.',
  },
  contract_expired: {
    action: "Confirm renewal and update the contract end date, or set status to Free Agent.",
    fields: ["contractUntil", "status"],
  },
  contract_expiring_soon: {
    action: "Confirm renewal intent with the club and schedule a check-in.",
    fields: ["contractUntil"],
    hint: "Log a Coffee Catch Up interaction to track the conversation.",
  },
  loan_parent_matches_club: {
    action: "Either turn off the on-loan flag or correct the parent club.",
    fields: ["onLoan", "parentClub"],
  },
  parent_club_without_loan_flag: {
    action: "Turn on the on-loan flag, or align parent club with the current club.",
    fields: ["onLoan", "parentClub"],
  },
  free_agent_with_club: {
    action: "Clear the club field or change status away from Free Agent.",
    fields: ["club", "status"],
  },
  club_without_free_agent_status: {
    action: "Set status to Free Agent, or replace the club with the actual club name.",
    fields: ["status", "club"],
  },
  missing_dob: {
    action: "Add date of birth as YYYY-MM-DD.",
    fields: ["dob"],
    hint: "There is no column for this yet — see the not-captured note on the audit page.",
  },
  age_dob_mismatch: {
    action: "Update the age to match the DOB, or correct the DOB if wrong.",
    fields: ["age", "dob"],
  },
  missing_profile_image: {
    action: "Upload a profile portrait to the media library and link it here.",
    fields: ["profileImage"],
    hint: "Square, head-and-shoulders. Optional but improves recognition across the app.",
  },
};
