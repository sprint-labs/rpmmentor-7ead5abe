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

/** Parse "June 2027" → Date at month end, or null. */
export function parseContractDate(input: string | undefined | null): Date | null {
  if (!input) return null;
  const m = input.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const year = Number(m[2]);
  if (month === undefined || !Number.isFinite(year)) return null;
  // End of month
  return new Date(year, month + 1, 0);
}

function parseDob(input: string | undefined | null): Date | null {
  if (!input) return null;
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const date = new Date(y, mo, d);
  return Number.isNaN(date.getTime()) ? null : date;
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

export function checkGoalkeeper(gk: Goalkeeper, now: Date = new Date()): RosterIssue[] {
  const issues: RosterIssue[] = [];
  const isFreeAgent = gk.status === "Free Agent";

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
    const raw = gk.contractUntil?.trim();
    if (!raw) {
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
          message: `Contract "${raw}" is not in the expected "Month YYYY" format.`,
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

  return issues;
}

const SEVERITY_WEIGHT: Record<IssueSeverity, number> = { error: 20, warning: 8, info: 2 };

export function scoreIssues(issues: RosterIssue[]): number {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
  return Math.max(0, 100 - penalty);
}

export function auditRoster(
  roster: Goalkeeper[],
  now: Date = new Date(),
): GoalkeeperQualityReport[] {
  return roster.map((gk) => {
    const issues = checkGoalkeeper(gk, now);
    return { gk, issues, score: scoreIssues(issues) };
  });
}

export interface RosterQualitySummary {
  totalKeepers: number;
  keepersWithIssues: number;
  totalIssues: number;
  bySeverity: Record<IssueSeverity, number>;
  byCode: Record<IssueCode, number>;
}

export function summarise(reports: GoalkeeperQualityReport[]): RosterQualitySummary {
  const bySeverity: Record<IssueSeverity, number> = { error: 0, warning: 0, info: 0 };
  const byCode = {} as Record<IssueCode, number>;
  let keepersWithIssues = 0;
  let totalIssues = 0;
  for (const r of reports) {
    if (r.issues.length > 0) keepersWithIssues += 1;
    for (const i of r.issues) {
      totalIssues += 1;
      bySeverity[i.severity] += 1;
      byCode[i.code] = (byCode[i.code] ?? 0) + 1;
    }
  }
  return { totalKeepers: reports.length, keepersWithIssues, totalIssues, bySeverity, byCode };
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
    hint: 'Example: "June 2027". Avoid abbreviations, day numbers, or slashes.',
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
    action: "Add date of birth in DD/MM/YYYY format.",
    fields: ["dob"],
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
