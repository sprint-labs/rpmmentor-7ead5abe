import { parseDob } from "@/lib/roster-quality";

/** Display DOB as dd/mm/yyyy when parseable; otherwise the raw value or a fallback. */
export function formatDobDisplay(input: string | undefined | null, empty = "Not recorded"): string {
  const parsed = parseDob(input);
  if (!parsed) {
    const raw = input?.trim();
    return raw || empty;
  }
  // Local getters, because `parseDob` builds the date at LOCAL midnight. Read
  // back in UTC, a DOB of 2004-07-16 is 23:00 on the 15th to anyone east of
  // Greenwich — the whole UK audience through British Summer Time — and every
  // profile showed the day before the one on record.
  const d = parsed.getDate();
  const m = parsed.getMonth() + 1;
  const y = parsed.getFullYear();
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
