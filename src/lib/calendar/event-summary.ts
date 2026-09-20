/**
 * What a calendar row says about an event, beyond what is already on screen.
 *
 * A fixture's title names both teams and the participation control beside it
 * says whether the goalkeeper is starting, so the summary carries only what
 * neither of those does: kick-off, who it is about, and who is going.
 *
 * Two things are deliberately absent. A match's location repeats the home team
 * already in its title. And who added the row is not something a reader of the
 * schedule needs — it is stored as a snapshot of the creator's profile name at
 * the moment they saved it, so it also goes stale the day that name changes.
 */
export function eventSummaryLine(event: {
  /** The event type as it is shown, e.g. "Match". */
  type: string;
  /** Kick-off as already formatted for display, or "" when there is none. */
  startTimeLabel?: string | null;
  location?: string | null;
  goalkeeperName?: string | null;
  mentorAttendingName?: string | null;
}): string {
  const isMatch = event.type === "Match";

  return [
    event.startTimeLabel,
    isMatch ? null : event.location,
    event.goalkeeperName,
    event.mentorAttendingName && `${event.mentorAttendingName} attending`,
  ]
    .filter(Boolean)
    .join(" · ");
}
