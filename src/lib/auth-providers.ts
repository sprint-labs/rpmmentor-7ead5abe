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
 * Until all three are true, pressing the button reaches Supabase, finds no
 * Google provider, and returns an error. A button that always fails is worse
 * than no button: it reads as a broken app rather than an unfinished setup.
 *
 * TO TURN IT BACK ON: complete the three steps above, then change this to
 * `true` and deploy. Nothing else needs to change.
 */
export const GOOGLE_SIGN_IN_ENABLED: boolean = false;
