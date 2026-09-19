/**
 * A control that edits locally and writes to the URL a beat later.
 *
 * Filters on the roster live in the URL, which is right — a filtered view is
 * shareable and survives a refresh. But writing there is a router navigation:
 * it re-runs the route, and on the roster that means re-filtering and
 * re-sorting the whole roster before the change appears.
 *
 * A control that writes on every event therefore pays that cost per event. A
 * range slider is the worst case — one `input` per pixel of drag — and the
 * search box is the same shape. Measured with the Vercel toolbar's Interaction
 * Timing panel, a slider drag cost 373ms per event inside an 824ms INP.
 *
 * So the control reads a local draft, which is instant, and the URL catches up
 * once the interaction settles. The URL stays the source of truth for what is
 * filtered; it just lands a beat after the gesture, so a shared or bookmarked
 * link is unchanged.
 */
import { useEffect, useRef, useState } from "react";

/** Long enough to coalesce a gesture, short enough to feel immediate. */
export const URL_DRAFT_DELAY_MS = 250;

export function useUrlDraft<T>(
  /** The committed value, read from the URL. */
  committed: T,
  /** Writes the value to the URL. */
  commit: (value: T) => void,
  delayMs: number = URL_DRAFT_DELAY_MS,
): [T, (value: T) => void] {
  const [draft, setDraft] = useState(committed);

  // What we last wrote, so a change we caused is told apart from a change
  // someone else caused — a back/forward, or Clear filters.
  const pushed = useRef(committed);

  // Held in a ref so a re-rendered parent passing a fresh `commit` does not
  // re-arm the timer and stretch the debounce indefinitely.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    // The URL moved under us. Adopt it, and drop any draft in flight.
    if (Object.is(committed, pushed.current)) return;
    pushed.current = committed;
    setDraft(committed);
  }, [committed]);

  useEffect(() => {
    if (Object.is(draft, pushed.current)) return;
    const timer = setTimeout(() => {
      pushed.current = draft;
      commitRef.current(draft);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [draft, delayMs]);

  return [draft, setDraft];
}
