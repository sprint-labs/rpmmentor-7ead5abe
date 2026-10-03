/** fixture: a Match. interaction: any other calendar event. logged: a saved interaction. */
export type EntryKind = "fixture" | "interaction" | "logged";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * What a day square announces: what is known to be on it, then whichever half
 * is still unknown. "Nothing on" is said only when both reads are in and the
 * day is empty, so an incomplete read is never presented as a final one.
 */
export function dayLabel(
  entries: readonly { kind: EntryKind }[],
  state: {
    bookingsLoading: boolean;
    /** "hidden" when the filter leaves logged interactions out of view. */
    loggedState: "known" | "loading" | "unavailable" | "hidden";
  },
): string {
  const count = (kind: EntryKind) => entries.filter((e) => e.kind === kind).length;
  const fixtures = count("fixture");
  const booked = count("interaction");
  const logged = count("logged");
  const known = [
    fixtures ? plural(fixtures, "fixture") : "",
    booked ? plural(booked, "interaction booked", "interactions booked") : "",
    logged ? plural(logged, "interaction logged", "interactions logged") : "",
  ].filter(Boolean);
  const unknown = [
    state.bookingsLoading ? "bookings loading" : "",
    state.loggedState === "loading" ? "logged interactions loading" : "",
    state.loggedState === "unavailable" ? "logged interactions unavailable" : "",
  ].filter(Boolean);
  if (unknown.length === 0) return known.length ? known.join(", ") : "nothing on";
  if (known.length === 0) {
    // Name the half that is known to be empty, when there is one.
    if (!state.bookingsLoading) known.push("nothing booked");
    else if (state.loggedState === "known") known.push("nothing logged");
  }
  return [...known, ...unknown].join(", ");
}
