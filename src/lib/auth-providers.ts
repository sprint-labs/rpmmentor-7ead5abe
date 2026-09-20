/**
 * Which sign-in routes the login page offers.
 *
 * Google sign-in is fully built — the button, the `signInWithOAuth` call and
 * the redirect handling are all in `src/routes/login.tsx` and work as soon as
 * the provider is switched on. What is missing is configuration that lives
 * outside this repository:
 *
 *   1. A Google OAuth "Web application" client whose Authorised redirect URIs
 *      include `https://zdxxezquhvpjmoxlecjp.supabase.co/auth/v1/callback`.
 *   2. That client's ID and secret saved under Supabase → Authentication →
 *      Sign In / Providers → Google, with the provider enabled.
 *   3. `https://www.rpmmentor.com/**` in Supabase → Authentication →
 *      URL Configuration → Redirect URLs.
 *
 * Until all three are true the button fails, and how it fails depends on how
 * far the setup got. With the provider off, Supabase rejects the call and the
 * error surfaces on our own page. With the provider on but holding credentials
 * that are not real — which is how this project was found on 2026-09-20, with
 * a placeholder client id — the browser is handed to Google, which answers
 * `Error 401: invalid_client / Unrecognized client_id` on a page of its own.
 *
 * The second is the worse of the two: it takes someone off the site entirely,
 * to an error in Google's words, from the one screen they see before they are
 * signed in. Either way a button that always fails reads as a broken app
 * rather than an unfinished setup.
 *
 * TO TURN IT BACK ON: complete the three steps above, then change this to
 * `true` and deploy. Nothing else needs to change.
 */
export const GOOGLE_SIGN_IN_ENABLED: boolean = false;
