import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { InsightWorkbench } from "@/components/insight-workbench";
import { DetailFact } from "@/components/workbench-primitives";
import { DutyBadge, TierBadge } from "@/components/primitives";
import { initialsOf } from "@/lib/initials";
import type { PlayerRosterRow } from "@/lib/players.functions";
import type { TeamCalendarEvent } from "@/lib/calendar.functions";
import type { ActiveMentorInsightRow } from "@/lib/active-mentor-insights";
import {
  DUTY_LABELS,
  formatRelative,
  type DutyLevel,
  type DutyStatus,
  type Goalkeeper,
} from "@/lib/mock-data";

/**
 * The remaining insight drilldowns, each on the shared workbench shell. Yellow
 * is reserved for the line a manager should act on — an unresolved loan, an
 * overdue duty band, a mentor with nothing recorded, an imminent fixture.
 */

function formatDay(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Total Goalkeepers
// ---------------------------------------------------------------------------

function loanLabel(player: PlayerRosterRow): string {
  if (!player.on_loan) return "Not on loan";
  return player.parent_club ? `On loan from ${player.parent_club}` : "On loan";
}

export function PlayerRecordWorkbench({ players }: { players: PlayerRosterRow[] }) {
  return (
    <InsightWorkbench<PlayerRosterRow>
      items={players}
      idOf={(player) => player.id}
      domId="selected-player-detail"
      headingId="selected-player-heading"
      listLabel="Player records"
      searchLabel="Search player records"
      searchPlaceholder="Search goalkeeper, club or league"
      searchFieldsOf={(player) => [
        player.full_name,
        player.current_club,
        player.parent_club,
        player.league,
        player.nationality,
      ]}
      filters={[
        {
          id: "league",
          label: "Filter by league",
          allLabel: "All leagues",
          optionsOf: (items) => [...new Set(items.map((p) => p.league).filter(Boolean))].sort(),
          matches: (player, value) => player.league === value,
        },
        {
          id: "club",
          label: "Filter by club",
          allLabel: "All clubs",
          optionsOf: (items) =>
            [...new Set(items.map((p) => p.current_club).filter(Boolean))].sort(),
          matches: (player, value) => player.current_club === value,
        },
      ]}
      tiles={(visible, all) => [
        {
          label: "Goalkeepers",
          mono: true,
          value: (
            <>
              {visible.length}
              {visible.length !== all.length ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  of {all.length}
                </span>
              ) : null}
            </>
          ),
        },
        {
          label: "Clubs",
          mono: true,
          value: new Set(visible.map((player) => player.current_club).filter(Boolean)).size,
        },
        {
          label: "Out on loan",
          mono: true,
          valueClassName: visible.some((player) => player.on_loan) ? "text-warning" : "",
          value: visible.filter((player) => player.on_loan).length,
        },
      ]}
      rowAriaLabel={(player) => `Show details for ${player.full_name}`}
      rowOf={(player) => ({
        initials: initialsOf(player.full_name),
        title: player.full_name,
        subtitle: player.current_club || "Club not recorded",
        middleTop: player.league || "League not recorded",
        middleBottom: player.on_loan ? loanLabel(player) : player.nationality || "—",
        middleBottomHighlighted: player.on_loan,
        rightTop: player.contract_until ? `to ${player.contract_until}` : "—",
      })}
      detailHeader={(player) => ({
        title: player.full_name,
        subtitle: `${player.current_club || "Club not recorded"}${player.league ? ` · ${player.league}` : ""}`,
      })}
      renderDetail={(player) => (
        <>
          <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <DetailFact label="Club" value={player.current_club || "Not recorded"} />
            <DetailFact label="League" value={player.league || "Not recorded"} />
            <DetailFact
              label="Loan status"
              value={
                player.on_loan ? (
                  <span className="text-warning">{loanLabel(player)}</span>
                ) : (
                  "Not on loan"
                )
              }
            />
            <DetailFact label="Parent club" value={player.parent_club || "Not recorded"} />
            <DetailFact label="Nationality" value={player.nationality || "Not recorded"} />
            <DetailFact label="Contract until" value={player.contract_until || "Not recorded"} />
          </dl>

          <Link
            to="/system/players/$playerId"
            params={{ playerId: player.id }}
            className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
          >
            Open player record <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
      noMatchLabel="No player records match these filters."
      placeholder="Select a goalkeeper to review their record."
    />
  );
}

// ---------------------------------------------------------------------------
// Duty of Care
// ---------------------------------------------------------------------------

export interface DutyRow {
  gk: Goalkeeper;
  duty: DutyStatus;
}

const DUTY_ORDER: DutyLevel[] = [
  "overdue",
  "due_soon",
  "up_to_date",
  "not_required",
  "not_enough_data",
];

function dutyTone(level: DutyLevel): string {
  if (level === "overdue") return "text-destructive";
  if (level === "due_soon") return "text-warning";
  if (level === "up_to_date") return "text-success";
  return "text-muted-foreground";
}

export function DutyOfCareWorkbench({
  rows,
  initialLevel,
}: {
  rows: DutyRow[];
  /** Duty band deep-linked from the dashboard, if any. */
  initialLevel?: string;
}) {
  const initialBand = DUTY_LABELS[initialLevel as DutyLevel];
  return (
    <InsightWorkbench<DutyRow>
      items={rows}
      initialFilters={initialBand ? { band: initialBand } : undefined}
      idOf={(row) => row.gk.id}
      domId="selected-duty-detail"
      headingId="selected-duty-heading"
      listLabel="Duty of care bands"
      searchLabel="Search duty of care"
      searchPlaceholder="Search goalkeeper, club or league"
      searchFieldsOf={(row) => [row.gk.name, row.gk.club, row.gk.league, row.duty.label]}
      filters={[
        {
          id: "band",
          label: "Filter by duty band",
          allLabel: "All bands",
          optionsOf: (items) => {
            const present = new Set(items.map((row) => row.duty.label));
            return DUTY_ORDER.map(
              (level) => items.find((row) => row.duty.level === level)?.duty.label ?? "",
            ).filter((label) => label && present.has(label));
          },
          matches: (row, value) => row.duty.label === value,
        },
        {
          id: "tier",
          label: "Filter by tier",
          allLabel: "All tiers",
          optionsOf: (items) => [...new Set(items.map((row) => row.gk.tier))].sort(),
          matches: (row, value) => row.gk.tier === value,
        },
      ]}
      tiles={(visible, all) => [
        {
          label: "Goalkeepers",
          mono: true,
          value: (
            <>
              {visible.length}
              {visible.length !== all.length ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  of {all.length}
                </span>
              ) : null}
            </>
          ),
        },
        {
          label: "Overdue",
          mono: true,
          valueClassName: visible.some((row) => row.duty.level === "overdue")
            ? "text-destructive"
            : "",
          value: visible.filter((row) => row.duty.level === "overdue").length,
        },
        {
          label: "Due soon",
          mono: true,
          valueClassName: visible.some((row) => row.duty.level === "due_soon")
            ? "text-warning"
            : "",
          value: visible.filter((row) => row.duty.level === "due_soon").length,
        },
      ]}
      rowAriaLabel={(row) => `Show details for ${row.gk.name}`}
      rowOf={(row) => ({
        initials: row.gk.initials || initialsOf(row.gk.name),
        title: row.gk.name,
        subtitle: row.gk.club || "Club not recorded",
        middleTop: row.gk.tier,
        middleBottom: row.duty.days ? `${row.duty.label} · ${row.duty.days}d` : row.duty.label,
        middleBottomHighlighted: row.duty.level === "overdue" || row.duty.level === "due_soon",
        rightTop: row.duty.label,
        rightTopClassName: dutyTone(row.duty.level),
        rightBottom: row.duty.days ? `${row.duty.days}d` : undefined,
      })}
      detailHeader={(row) => ({
        title: row.gk.name,
        subtitle: `${row.gk.club || "Club not recorded"}${row.gk.league ? ` · ${row.gk.league}` : ""}`,
        rightValue: row.duty.days ? `${row.duty.days}d` : "—",
        rightValueClassName: dutyTone(row.duty.level),
        rightLabel: "Since contact",
      })}
      renderDetail={(row) => (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DutyBadge level={row.duty.level} label={row.duty.label} />
            <TierBadge tier={row.gk.tier} />
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <DetailFact label="Club" value={row.gk.club || "Not recorded"} />
            <DetailFact label="League" value={row.gk.league || "Not recorded"} />
            <DetailFact label="Tier" value={row.gk.tier} />
            <DetailFact label="Region" value={row.gk.region} />
            <DetailFact
              label="Duty band"
              value={<span className={dutyTone(row.duty.level)}>{row.duty.label}</span>}
            />
            <DetailFact
              label="Days since qualifying contact"
              value={row.duty.days ? `${row.duty.days} days` : "Not enough data"}
            />
          </dl>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Reference-only cadence band. It is derived from qualifying interactions in the selected
            window and is not a canonical operational count.
          </p>

          <Link
            to="/goalkeepers/$gkId"
            params={{ gkId: row.gk.id }}
            className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
          >
            Open goalkeeper profile <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
      noMatchLabel="No goalkeepers match these filters."
      placeholder="Select a goalkeeper to review their duty of care band."
    />
  );
}

// ---------------------------------------------------------------------------
// Active Mentors
// ---------------------------------------------------------------------------

export function ActiveMentorWorkbench({ mentors }: { mentors: ActiveMentorInsightRow[] }) {
  const fullName = (mentor: ActiveMentorInsightRow) =>
    `${mentor.firstName} ${mentor.lastName}`.trim() || mentor.name;

  return (
    <InsightWorkbench<ActiveMentorInsightRow>
      items={mentors}
      idOf={(mentor) => mentor.id}
      domId="selected-mentor-detail"
      headingId="selected-mentor-heading"
      listLabel="Mentor accounts"
      searchLabel="Search mentors"
      searchPlaceholder="Search mentor name"
      searchFieldsOf={(mentor) => [mentor.name, mentor.firstName, mentor.lastName]}
      filters={[
        {
          id: "role",
          label: "Filter by role",
          allLabel: "All roles",
          optionsOf: (items) => [
            ...new Set(items.map((m) => (m.isManager ? "Mentor Manager" : "Mentor"))),
          ],
          matches: (mentor, value) => (mentor.isManager ? "Mentor Manager" : "Mentor") === value,
        },
      ]}
      tiles={(visible, all) => [
        {
          label: "Mentors",
          mono: true,
          value: (
            <>
              {visible.length}
              {visible.length !== all.length ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  of {all.length}
                </span>
              ) : null}
            </>
          ),
        },
        {
          label: "Interactions logged",
          mono: true,
          value: visible.reduce((total, mentor) => total + mentor.interactionsLogged, 0),
        },
        {
          label: "Nothing recorded",
          mono: true,
          valueClassName: visible.some(
            (mentor) => mentor.interactionsLogged === 0 && mentor.matchReportsSubmitted === 0,
          )
            ? "text-warning"
            : "",
          value: visible.filter(
            (mentor) => mentor.interactionsLogged === 0 && mentor.matchReportsSubmitted === 0,
          ).length,
        },
      ]}
      rowAriaLabel={(mentor) => `Show details for ${fullName(mentor)}`}
      rowOf={(mentor) => {
        const silent = mentor.interactionsLogged === 0 && mentor.matchReportsSubmitted === 0;
        return {
          initials: initialsOf(fullName(mentor)),
          title: fullName(mentor),
          subtitle: mentor.isManager ? "Mentor Manager" : "Mentor",
          middleTop: `${mentor.interactionsLogged} interactions`,
          middleBottom: silent
            ? "Nothing recorded yet"
            : `${mentor.matchReportsSubmitted} match reports`,
          middleBottomHighlighted: silent,
          rightTop: `${mentor.interactionsLogged} int`,
          rightBottom: `${mentor.matchReportsSubmitted} rep`,
        };
      }}
      detailHeader={(mentor) => ({
        title: fullName(mentor),
        subtitle: mentor.isManager ? "Mentor Manager" : "Mentor",
        rightValue: String(mentor.interactionsLogged),
        rightValueClassName: mentor.interactionsLogged === 0 ? "text-warning" : "",
        rightLabel: "Interactions",
      })}
      renderDetail={(mentor) => (
        <>
          <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <DetailFact label="Role" value={mentor.isManager ? "Mentor Manager" : "Mentor"} />
            <DetailFact label="Interactions logged" value={mentor.interactionsLogged} />
            <DetailFact label="Match reports submitted" value={mentor.matchReportsSubmitted} />
            <DetailFact
              label="Recorded output"
              value={
                mentor.interactionsLogged === 0 && mentor.matchReportsSubmitted === 0 ? (
                  <span className="text-warning">Nothing recorded yet</span>
                ) : (
                  `${mentor.interactionsLogged + mentor.matchReportsSubmitted} records`
                )
              }
            />
          </dl>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Counts come from the mentor directory enriched with recorded activity. A mentor with
            nothing recorded still holds mentor access.
          </p>

          <Link
            to="/mentors"
            className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
          >
            Open users &amp; roles <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
      noMatchLabel="No mentor accounts match these filters."
      placeholder="Select a mentor to review their recorded output."
    />
  );
}

// ---------------------------------------------------------------------------
// Scheduled Events
// ---------------------------------------------------------------------------

/** Today and tomorrow are the ones worth flagging in the list. */
function isImminent(eventDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return eventDate === today || eventDate === tomorrow;
}

export function ScheduledEventWorkbench({ events }: { events: TeamCalendarEvent[] }) {
  return (
    <InsightWorkbench<TeamCalendarEvent>
      items={events}
      idOf={(event) => event.id}
      domId="selected-event-detail"
      headingId="selected-event-heading"
      listLabel="Scheduled events"
      searchLabel="Search scheduled events"
      searchPlaceholder="Search event, goalkeeper or location"
      searchFieldsOf={(event) => [
        event.title,
        event.event_type,
        event.goalkeeper_name,
        event.location,
        event.assigned_mentor_name,
      ]}
      filters={[
        {
          id: "type",
          label: "Filter by event type",
          allLabel: "All types",
          optionsOf: (items) => [...new Set(items.map((e) => e.event_type).filter(Boolean))].sort(),
          matches: (event, value) => event.event_type === value,
        },
        {
          id: "mentor",
          label: "Filter by mentor",
          allLabel: "All mentors",
          optionsOf: (items) =>
            [...new Set(items.map((e) => e.assigned_mentor_name).filter(Boolean))].sort(),
          matches: (event, value) => event.assigned_mentor_name === value,
        },
      ]}
      tiles={(visible, all) => [
        {
          label: "Events",
          mono: true,
          value: (
            <>
              {visible.length}
              {visible.length !== all.length ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  of {all.length}
                </span>
              ) : null}
            </>
          ),
        },
        {
          label: "Next up",
          value: visible[0] ? formatDay(visible[0].event_date) : "—",
        },
        {
          label: "Today or tomorrow",
          mono: true,
          valueClassName: visible.some((event) => isImminent(event.event_date))
            ? "text-warning"
            : "",
          value: visible.filter((event) => isImminent(event.event_date)).length,
        },
      ]}
      rowAriaLabel={(event) => `Show details for ${event.title} on ${formatDay(event.event_date)}`}
      rowOf={(event) => ({
        initials: initialsOf(event.goalkeeper_name || event.title),
        title: event.title,
        subtitle: `${event.event_type}${event.goalkeeper_name ? ` · ${event.goalkeeper_name}` : ""}`,
        middleTop: event.assigned_mentor_name || "Mentor not assigned",
        middleBottom: isImminent(event.event_date)
          ? formatRelative(event.event_date)
          : event.location || "Location not recorded",
        middleBottomHighlighted: isImminent(event.event_date),
        rightTop: formatDay(event.event_date),
        rightBottom: event.start_time ? event.start_time.slice(0, 5) : undefined,
      })}
      detailHeader={(event) => ({
        title: event.title,
        subtitle: `${event.event_type} · ${formatDay(event.event_date)}${event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ""}`,
      })}
      renderDetail={(event) => (
        <>
          <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <DetailFact label="Event type" value={event.event_type} />
            <DetailFact
              label="When"
              value={
                isImminent(event.event_date) ? (
                  <span className="text-warning">
                    {formatRelative(event.event_date)} · {formatDay(event.event_date)}
                  </span>
                ) : (
                  formatDay(event.event_date)
                )
              }
            />
            <DetailFact
              label="Start time"
              value={event.start_time ? event.start_time.slice(0, 5) : "Not recorded"}
            />
            <DetailFact label="Location" value={event.location || "Not recorded"} />
            <DetailFact label="Goalkeeper" value={event.goalkeeper_name || "Not recorded"} />
            <DetailFact label="Mentor" value={event.assigned_mentor_name || "Not assigned"} />
          </dl>

          <section className="mt-5" aria-labelledby="selected-event-notes">
            <h3
              id="selected-event-notes"
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
            >
              Notes
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
              {event.notes || "No notes recorded."}
            </p>
          </section>

          <Link
            to="/calendar"
            className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
          >
            Open calendar <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
      noMatchLabel="No scheduled events match these filters."
      placeholder="Select an event to review its detail."
    />
  );
}
