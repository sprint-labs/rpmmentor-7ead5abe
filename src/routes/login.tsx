import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GkhqLockup } from "@/components/gkhq-lockup";
import { passwordRecoveryRedirectUrl } from "@/lib/password-recovery";
import { canonicalUrl } from "@/lib/canonical-url";
import { GOOGLE_SIGN_IN_ENABLED } from "@/lib/auth-providers";
import { MAINTENANCE_MODE } from "@/lib/maintenance";

/**
 * Google's own "G", drawn rather than loaded.
 *
 * Their sign-in branding requires the four-colour mark unaltered, and a
 * remote image would put a third-party request on the one screen that has to
 * render before anyone is authenticated. The paths are the published asset.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s.next) }),
  component: LoginPage,
});

type View = "signin" | "forgot" | "sent";

function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [view, setView] = useState<View>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    if (user) navigate({ to: next, replace: true });
  }, [user, navigate, next]);

  /**
   * Hand off to Google. The browser leaves this page, so there is no success
   * path to handle here — only a failure to launch, which is worth saying out
   * loud because the commonest cause is the provider not being enabled on the
   * Supabase project at all, and a silent button looks like a broken one.
   *
   * `redirectTo` is the canonical origin rather than wherever this page is
   * being served from, so one entry in Supabase's redirect allow-list covers
   * every deployment. `next` has already been through safeNext, so it cannot
   * carry an off-site destination.
   */
  async function handleGoogleSignIn() {
    setError(null);
    setGoogleSubmitting(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: canonicalUrl(next) },
    });
    if (oauthError) {
      setError(
        "Could not start Google sign-in. Use your email and password, or contact your admin.",
      );
      setGoogleSubmitting(false);
    }
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    const res = await signIn(email, password);
    setSubmitting(false);
    if (!res.ok) setError(res.error || "Invalid email or password.");
  }

  async function handleForgotSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    const redirectTo = passwordRecoveryRedirectUrl();
    await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
    setSentTo(resetEmail.trim());
    setResetEmail("");
    setView("sent");
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <GkhqLockup
            className="gap-3"
            markClassName="size-16"
            wordmarkClassName="h-9 w-auto"
            alt="GKHQ Mentor Hub"
          />
        </div>

        {MAINTENANCE_MODE && (
          <div role="status" className="mb-8 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-ink">Temporary maintenance</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Access is currently limited while final updates are completed. We expect the platform to be live again within the next couple of hours.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              If you have any questions, please contact <span className="font-semibold text-foreground">Luke</span>.
            </p>
          </div>
        )}


        {view === "signin" && (
          <>
            <div className="mb-8">
              <h1 className="text-lg font-display font-bold tracking-[0.02em] leading-tight whitespace-nowrap">
                Welcome to the mentor hub
              </h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Sign in with your Username &amp; Password below
              </p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="block text-xs font-medium mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input id="email" type="email" autoComplete="email" required autoFocus value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="you@gkhq.app"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs font-medium">Password</label>
                  <button type="button" onClick={() => setView("forgot")} className="min-h-11 px-1 text-xs text-muted-foreground hover:text-foreground">Forgot password?</button>
                </div>
                <div className="relative">
                  <Lock className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input id="password" type={showPw ? "text" : "password"} autoComplete="current-password" required value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 size-11 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && <div role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{error}</div>}

              <button type="submit" disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* The divider and the Google button travel together: an OR with
                nothing on the far side of it is worse than neither. See
                `GOOGLE_SIGN_IN_ENABLED` for what has to be true to show them. */}
            {GOOGLE_SIGN_IN_ENABLED && (
              <>
                {/* The rule is drawn behind the word rather than as two flex
                    children so "OR" stays centred on the form, not on whatever
                    width the two halves happen to take. */}
                <div className="relative my-6">
                  <span aria-hidden="true" className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </span>
                  <span className="relative flex justify-center">
                    <span className="bg-background px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      or
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleSubmitting}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl border border-border bg-card text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors disabled:opacity-60"
                >
                  <GoogleMark className="size-4 shrink-0" />
                  {googleSubmitting ? "Redirecting to Google…" : "Continue with Google"}
                </button>
              </>
            )}

            <p className="text-[11px] text-muted-foreground mt-8 leading-relaxed">
              Mentor Hub accounts are provisioned by an administrator. If you need access, contact{" "}
              <a
                href="mailto:Luke@Sprintlabs.uk"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Luke@Sprintlabs.uk
              </a>
              .
            </p>
          </>
        )}

        {view === "forgot" && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-display font-bold uppercase tracking-[0.02em] leading-tight">Reset your password</h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">Enter your email and we'll send you a link to reset your password.</p>
            </div>

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-xs font-medium mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input id="reset-email" type="email" required autoFocus value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition" />
                </div>
              </div>

              <button type="submit" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                Send reset link
              </button>

              <button type="button" onClick={() => setView("signin")} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-3.5" />Back to sign in
              </button>
            </form>
          </>
        )}

        {view === "sent" && (
          <>
            <div className="mb-8">
              <div className="size-12 rounded-xl bg-secondary grid place-items-center mb-5"><CheckCircle2 className="size-6 text-primary-ink" /></div>
              <h1 className="text-2xl font-display font-bold uppercase tracking-[0.02em] leading-tight">Check your inbox</h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">If an account exists for <span className="text-foreground font-medium">{sentTo}</span>, you'll receive a reset link shortly.</p>
            </div>

            <button type="button" onClick={() => setView("signin")}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-card hover:bg-accent/30 text-sm font-medium">
              <ArrowLeft className="size-4" />Back to sign in
            </button>
          </>
        )}
      </div>
    </main>
  );
}
