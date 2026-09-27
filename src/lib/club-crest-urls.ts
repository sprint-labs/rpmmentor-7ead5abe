/**
 * Local club crest artwork keyed by roster club name.
 *
 * There is no crest column on `public.players`. These files were sourced from
 * Goal.com / Sportfeeds team crest URLs for the Tier‑1 goalkeeper profiles that
 * needed real badges, and are stored under `public/clubs/` so the UI does not
 * hotlink a third-party CDN at runtime.
 */
const CREST_BY_CLUB: Readonly<Record<string, string>> = {
  "Tottenham Hotspur": "/clubs/tottenham-hotspur.webp",
  "Birmingham City": "/clubs/birmingham-city.webp",
  Wolves: "/clubs/wolves.webp",
  "Sheffield Wednesday": "/clubs/sheffield-wednesday.webp",
};

export function clubCrestUrlFor(club: string | null | undefined): string | undefined {
  const key = club?.trim();
  if (!key) return undefined;
  return CREST_BY_CLUB[key];
}
