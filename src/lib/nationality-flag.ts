/**
 * Flag emoji for a stored `players.nationality`.
 *
 * The column holds free text written the way a scout would say it — "England",
 * "Republic of Ireland", "Bosnia-Herzegovina" — not ISO codes, so this maps the
 * wording rather than deriving anything. Anything unrecognised returns null and
 * the citizenship box simply shows the name, because a wrong flag against a
 * real person's record is worse than no flag.
 *
 * The four Home Nations are subdivision flags (RGI sequences), not country
 * pairs: there is no `GB-ENG` regional-indicator flag, England is
 * U+1F3F4 followed by the tag characters for `gbeng`. Northern Ireland has no
 * emoji at all — Unicode never assigned one — so it is deliberately absent
 * rather than being given the Union Flag, which is a different thing.
 */

/** Build a subdivision flag from its ISO 3166-2 code, e.g. `gbeng`. */
function subdivisionFlag(code: string): string {
  return (
    "\u{1F3F4}" +
    [...code].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join("") +
    "\u{E007F}"
  );
}

/** Build a country flag from its ISO 3166-1 alpha-2 code, e.g. `IE`. */
function countryFlag(alpha2: string): string {
  return [...alpha2.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 65)))
    .join("");
}

/**
 * Every nationality spelling currently in `public.players`, plus the common
 * alternates a scout might type for the same country.
 */
const ALPHA2: Record<string, string> = {
  australia: "AU",
  "bosnia-herzegovina": "BA",
  "bosnia and herzegovina": "BA",
  chile: "CL",
  denmark: "DK",
  france: "FR",
  "new zealand": "NZ",
  poland: "PL",
  portugal: "PT",
  "republic of ireland": "IE",
  ireland: "IE",
  senegal: "SN",
  sweden: "SE",
  uganda: "UG",
  "united arab emirates": "AE",
  // Present for completeness; none is in the roster today.
  brazil: "BR",
  germany: "DE",
  italy: "IT",
  jamaica: "JM",
  netherlands: "NL",
  nigeria: "NG",
  norway: "NO",
  spain: "ES",
  "united states": "US",
  usa: "US",
};

const SUBDIVISION: Record<string, string> = {
  england: "gbeng",
  scotland: "gbsct",
  wales: "gbwls",
};

export function flagFor(nationality: string | null | undefined): string | null {
  const key = (nationality ?? "").trim().toLowerCase();
  if (!key) return null;
  const subdivision = SUBDIVISION[key];
  if (subdivision) return subdivisionFlag(subdivision);
  const alpha2 = ALPHA2[key];
  return alpha2 ? countryFlag(alpha2) : null;
}
