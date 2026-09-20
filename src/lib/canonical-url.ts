/**
 * Canonical production domain for the app. All user-facing links generated
 * server-side or delivered by email (invites, password resets, OAuth redirects)
 * must resolve here so they work regardless of which preview/published origin
 * a session was initiated from.
 */
export const CANONICAL_ORIGIN = "https://www.rpmmentor.com";

export function canonicalUrl(path: string = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_ORIGIN}${suffix}`;
}

/** The single host every piece of auth material is tied to. */
export const CANONICAL_HOST = CANONICAL_ORIGIN.replace(/^https?:\/\//, "");

/**
 * Hosts that serve this same application but are not the canonical one.
 *
 * The apex is pointed at the same Vercel project as `www` and is not a
 * redirect to it, so both addresses render a working app — and the operating
 * guide sends people to the apex. That split breaks browser-initiated auth,
 * because the PKCE verifier is written to the origin the flow starts on while
 * Supabase always returns to the canonical one: the callback arrives at an
 * origin whose storage has no verifier, the exchange finds nothing, and a
 * sign-in that Supabase recorded as successful leaves no session behind.
 */
export const ALIAS_HOSTS: readonly string[] = ["rpmmentor.com"];

/**
 * Pre-hydration script. This has to run before anything reads the address
 * bar — the Supabase client consumes an auth callback as soon as it is first
 * touched — so the hand-over happens on the very first paint rather than
 * after React has mounted and already spent the code on the wrong origin.
 */
export const canonicalOriginScript = `
try {
  var a = ${JSON.stringify(ALIAS_HOSTS)};
  var l = window.location;
  if (a.indexOf(l.hostname) !== -1) {
    l.replace(${JSON.stringify(CANONICAL_ORIGIN)} + l.pathname + l.search + l.hash);
  }
} catch (e) {}
`;
