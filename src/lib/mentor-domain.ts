/**
 * Mentor domain adapter.
 *
 * This layer wraps the current mock data behind Supabase-style row shapes and
 * selectors so the mentor UI can be ported to a real backend without
 * refactoring components.
 *
 * Target Supabase schema (for reference — not created yet):
 *
 *   profiles              (id uuid pk = auth.users.id, full_name, role, avatar_initials, title)
 *   players               (id uuid pk, full_name, club, league, status, region, dob, contract_until, ...)
 *   player_assignments    (id uuid pk, player_id fk, mentor_profile_id fk, active bool, assigned_at)
 *   mentor_interactions   (id uuid pk, player_id fk, mentor_profile_id fk, interaction_type,
 *                          occurred_at, notes, outcome, follow_up, transcript_source)
 *   match_reports         (id uuid pk, player_id fk, mentor_profile_id fk, report_type,
 *                          occurred_at, overall_rating, summary, scores jsonb)
 *   duty_of_care_status   (player_id pk fk, level 'green'|'amber', days_since_contact,
 *                          last_contact_at, computed_at) — view/materialised view
 *   media_items           (id uuid pk, player_id fk, uploaded_by fk, kind, title, size_bytes)
 *
 * Every function here returns plain rows that map 1:1 onto those tables.
 */

import {
  goalkeepers,
  mentors,
  interactions,
  reports,
  media,
  calendarEvents,
  dutyStatusForGk,
  getGk,
  getMentor,
  type DutyLevel,
} from "@/lib/mock-data";
import {
  getSessionInteractions,
  getSessionReports,
  insertMentorInteraction as insertMentorInteractionRow,
  insertMatchReport as insertMatchReportRow,
  subscribeMentorSession,
} from "@/lib/mentor-session-store";

export { insertMentorInteractionRow, insertMatchReportRow, subscribeMentorSession };

// ---------- Row shapes (Supabase-style) ----------

export interface PlayerRow {
  id: string;
  full_name: string;
  initials: string;
  club: string;
  league: string;
  status: string;
  region: string;
  age: number;
  nationality: string;
  contract_until: string;
  next_fixture_at: string;
  last_contact_at: string;
  rating: number;
  potential: number;
  recommendation: string;
}

export interface PlayerAssignmentRow {
  id: string;
  player_id: string;
  mentor_profile_id: string;
  active: boolean;
}

export interface DutyOfCareRow {
  player_id: string;
  level: DutyLevel;
  days_since_contact: number;
  last_contact_at: string;
  label: string;
}

export type WellbeingFlag = "green" | "amber" | "red";

export interface MentorInteractionRow {
  id: string;
  player_id: string;
  mentor_profile_id: string;
  interaction_type: string;
  occurred_at: string;
  notes: string;
  outcome: string;
  follow_up: string;
  /** Optional richer fields — populated for session-created rows. */
  wellbeing_flag?: WellbeingFlag;
  follow_up_required?: boolean;
  next_action?: string;
  transcript_source?: "voice_note" | "typed" | "handwritten";
}

/**
 * The seven RPM goalkeeper metrics, scored 1-10.
 * Reference schema: match_reports.scores jsonb.
 */
export interface Rpm7Scores {
  shot_stopping: number;
  distribution: number;
  aerial_command: number;
  one_v_one: number;
  communication: number;
  decision_making: number;
  footwork: number;
}

export const RPM7_METRICS: Array<{ key: keyof Rpm7Scores; label: string; hint: string }> = [
  { key: "shot_stopping", label: "Shot stopping", hint: "Reactions, positioning, saves" },
  { key: "distribution", label: "Distribution", hint: "Throws, kicks, build-up" },
  { key: "aerial_command", label: "Aerial command", hint: "Crosses, corners, claims" },
  { key: "one_v_one", label: "1 v 1", hint: "Smother, spread, timing" },
  { key: "communication", label: "Communication", hint: "Organising the back line" },
  { key: "decision_making", label: "Decision making", hint: "When to come, when to stay" },
  { key: "footwork", label: "Footwork", hint: "Set, shuffle, first step" },
];

export interface MatchReportRow {
  id: string;
  player_id: string;
  mentor_profile_id: string;
  report_type: string;
  occurred_at: string;
  overall_rating: number;
  summary: string;
  /** Optional richer fields — populated for session-created rows. */
  fixture?: string;
  opposition?: string;
  minutes_watched?: number;
  recommendation?: string;
  scores?: Rpm7Scores;
}

export interface UpcomingFixtureRow {
  id: string;
  player_id?: string;
  title: string;
  occurred_at: string;
  event_type: string;
}

// ---------- Mappers ----------

function toPlayerRow(id: string): PlayerRow | null {
  const g = getGk(id);
  if (!g) return null;
  return {
    id: g.id,
    full_name: g.name,
    initials: g.initials,
    club: g.club,
    league: g.league,
    status: g.status,
    region: g.region,
    age: g.age,
    nationality: g.nationality,
    contract_until: g.contractUntil,
    next_fixture_at: g.nextInteraction,
    last_contact_at: g.lastInteraction,
    rating: g.rating,
    potential: g.potential,
    recommendation: g.recommendation,
  };
}

function toDutyRow(id: string): DutyOfCareRow | null {
  const g = getGk(id);
  if (!g) return null;
  const d = dutyStatusForGk(g);
  return {
    player_id: g.id,
    level: d.level,
    days_since_contact: d.days,
    last_contact_at: g.lastInteraction,
    label: d.label,
  };
}

// ---------- Selectors ----------

/** Full RPM client roster — mentors work collaboratively, so every mentor sees all goalkeepers. */
export function selectAssignedPlayers(_mentorProfileId: string): PlayerRow[] {
  return goalkeepers
    .map((g) => toPlayerRow(g.id)!)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Duty of care rows for the full roster, ordered worst-first. */
export function selectDutyOfCareForMentor(_mentorProfileId: string): DutyOfCareRow[] {
  const rank: Record<DutyLevel, number> = {
    overdue: 0,
    due_soon: 1,
    up_to_date: 2,
    not_enough_data: 3,
    not_required: 4,
  };
  return goalkeepers
    .map((g) => toDutyRow(g.id)!)
    .sort((a, b) => rank[a.level] - rank[b.level] || b.days_since_contact - a.days_since_contact);
}

/** Roster roll-up by duty level. */
export function selectDutyRollup(mentorProfileId: string) {
  const rows = selectDutyOfCareForMentor(mentorProfileId);
  const total = rows.length || 1;
  const upToDate = rows.filter((r) => r.level === "up_to_date").length;
  const dueSoon = rows.filter((r) => r.level === "due_soon").length;
  const overdue = rows.filter((r) => r.level === "overdue").length;
  return {
    total: rows.length,
    upToDate,
    dueSoon,
    overdue,
    upToDatePct: (upToDate / total) * 100,
    dueSoonPct: (dueSoon / total) * 100,
    overduePct: (overdue / total) * 100,
  };
}

/** Overdue / due-soon players, most-urgent first. Used for the priority queue. */
export function selectOverduePlayers(mentorProfileId: string, limit = 5) {
  return selectDutyOfCareForMentor(mentorProfileId)
    .filter((d) => d.level === "overdue" || d.level === "due_soon")
    .slice(0, limit)
    .map((d) => ({ duty: d, player: toPlayerRow(d.player_id)! }));
}

/** Recent interactions logged by this mentor (session-store rows first, then seed data). */
export function selectRecentInteractions(
  mentorProfileId: string,
  limit = 8,
): MentorInteractionRow[] {
  const session = getSessionInteractions().filter((r) => r.mentor_profile_id === mentorProfileId);
  const seeded: MentorInteractionRow[] = interactions
    .filter((i) => i.mentorId === mentorProfileId)
    .map((i) => ({
      id: i.id,
      player_id: i.gkId,
      mentor_profile_id: i.mentorId,
      interaction_type: i.type,
      occurred_at: i.date,
      notes: i.notes,
      outcome: i.outcome,
      follow_up: i.followUp,
    }));
  return [...session, ...seeded]
    .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at))
    .slice(0, limit);
}

/** Recent match reports authored by this mentor (session-store rows first). */
export function selectRecentReports(mentorProfileId: string, limit = 6): MatchReportRow[] {
  const session = getSessionReports().filter((r) => r.mentor_profile_id === mentorProfileId);
  const seeded: MatchReportRow[] = reports
    .filter((r) => r.authorId === mentorProfileId)
    .map((r) => ({
      id: r.id,
      player_id: r.gkId,
      mentor_profile_id: r.authorId,
      report_type: r.type,
      occurred_at: r.date,
      overall_rating: r.rating,
      summary: r.summary,
    }));
  return [...session, ...seeded]
    .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at))
    .slice(0, limit);
}

/** Next fixtures/observations across the full client roster. */
export function selectUpcomingForMentor(
  _mentorProfileId: string,
  days = 14,
  limit = 6,
): UpcomingFixtureRow[] {
  const now = Date.now();
  const cutoff = now + days * 86400000;
  return calendarEvents
    .filter((e) => e.gkId && +new Date(e.date) >= now && +new Date(e.date) <= cutoff)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      player_id: e.gkId,
      title: e.title,
      occurred_at: e.date,
      event_type: e.type,
    }));
}

/** Monthly interaction target vs completed — for the mentor progress meter. */
export function selectMentorProgress(mentorProfileId: string) {
  const m = getMentor(mentorProfileId);
  if (!m) return { completed: 0, target: 0, pct: 0 };
  const pct =
    m.targetInteractions === 0
      ? 0
      : Math.min(100, (m.completedThisMonth / m.targetInteractions) * 100);
  return { completed: m.completedThisMonth, target: m.targetInteractions, pct };
}

/** Player-scoped duty of care lookup (for player profile prompts). */
export function selectDutyForPlayer(playerId: string): DutyOfCareRow | null {
  return toDutyRow(playerId);
}

/** Single player row lookup, exported for workflow forms. */
export function selectPlayer(playerId: string): PlayerRow | null {
  return toPlayerRow(playerId);
}

/** Media count per player across the full roster (used in list badges). */
export function selectMediaCountByPlayer(_mentorProfileId: string): Record<string, number> {
  const out: Record<string, number> = {};
  media.forEach((m) => {
    out[m.gkId] = (out[m.gkId] ?? 0) + 1;
  });
  return out;
}

/** Convenience: resolve mentor profile from a session user with `mentorId`. */
export function resolveMentorProfile(sessionMentorId?: string) {
  if (!sessionMentorId) return null;
  const m = getMentor(sessionMentorId);
  if (!m) return null;
  return {
    id: m.id,
    full_name: m.name,
    initials: m.initials,
    role: m.role,
    region: m.region,
    email: m.email,
  };
}
