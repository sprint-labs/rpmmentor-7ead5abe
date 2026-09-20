/**
 * Which sign-in routes the login page offers.
 *
 * Google sign-in depends on configuration that lives outside this repository,
 * so the flag exists to keep the button off the page whenever that
 * configuration is not in place:
 *
 *   1. A Google OAuth "Web application" client whose Authorised redirect URIs
 *      include `https://zdxxezquhvpjmoxlecjp.supabase.co/auth/v1/callback`.
 *   2. That client's real ID and secret saved under Supabase → Authentication
 *      → Sign In / Providers → Google, with the provider enabled.
 *   3. `https://www.rpmmentor.com/**` in Supabase → Authentication →
 *      URL Configuration → Redirect URLs.
 *
 * When any of those is missing the button fails, and how it fails depends on
 * which one. With the provider off, Supabase rejects the call and the error
 * surfaces on our own page. With the provider on but holding credentials that
 * are not real — which is how this project was found on 2026-09-20, against a
 * placeholder client id — the browser is handed to Google, which answers
 * `Error 401: invalid_client / Unrecognized client_id` on a page of its own.
 * That second one is the worse: it takes someone off the site entirely, to an
 * error in Google's words, from the screen they see before they are signed in.
 *
 * SET THIS TO `false` if the button starts failing again. Nothing else needs to
 * change; the divider above it is gated on the same flag, and no code path is
 * removed either way.
 */
export const GOOGLE_SIGN_IN_ENABLED: boolean = true;
