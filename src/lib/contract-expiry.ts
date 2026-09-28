/**
 * How a contract expiry reads on a goalkeeper's profile.
 *
 * `Goalkeeper.contractUntil` is ISO (`contractISO` converts the roster's
 * "June 2028" into `2028-06-30`), but a day is not something anyone recorded —
 * it is the month-end that conversion picked. So the month and year are all
 * that is shown, and anything that is not a full ISO date reads as not
 * recorded rather than as a date.
 *
 * Shared by the profile page and the dossier built from it: the same contract
 * must not read "June 2028" on screen and `2028-06-30` on paper.
 */
export function formatContractExpiry(value: string): string {
  if (value === "—") return "-";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not recorded";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
