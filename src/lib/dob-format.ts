import { parseDob } from "@/lib/roster-quality";

/** Display DOB as dd/mm/yyyy when parseable; otherwise the raw value or a fallback. */
export function formatDobDisplay(input: string | undefined | null, empty = "Not recorded"): string {
  const parsed = parseDob(input);
  if (!parsed) {
    const raw = input?.trim();
    return raw || empty;
  }
  const d = parsed.getUTCDate();
  const m = parsed.getUTCMonth() + 1;
  const y = parsed.getUTCFullYear();
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
