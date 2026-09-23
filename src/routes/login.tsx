import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GkhqMark } from "@/components/gkhq-lockup";
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

const viewMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.2, ease: "easeInOut" },
} as const;

type Star = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
};

// Seeded so the server and client render identical positions (no hydration mismatch).
function makeStars(seed: number, count: number): Star[] {
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    size: rand() < 0.8 ? 1 : 2,
    opacity: 0.3 + rand() * 0.4,
    duration: 3 + rand() * 4,
    delay: rand() * 5,
  }));
}

const CARD_STARS = makeStars(7, 36);
const PAGE_STARS = makeStars(101, 48);

function StarField({ stars }: { stars: Star[] }) {
  return stars.map((s, i) => (
    <span
      key={i}
      className="absolute"
      style={{ left: `${s.x}%`, top: `${s.y}%`, opacity: s.opacity }}
    >
      <span
        className="block rounded-full bg-primary animate-pulse motion-reduce:animate-none"
        style={{
          width: s.size,
          height: s.size,
          boxShadow: `0 0 ${s.size * 3}px var(--primary)`,
          animationDuration: `${s.duration}s`,
          animationDelay: `${s.delay}s`,
        }}
      />
    </span>
  ));
}

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

  const inputClass =
    "w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background p-4 sm:p-6"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <StarField stars={PAGE_STARS} />
      </div>

      <MotionConfig reducedMotion="user">
        <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-card/45 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_0_0_1px_rgba(255,255,255,0.03)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-white/[0.02]" />
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            <StarField stars={CARD_STARS} />
          </div>

          <div className="relative p-6 sm:p-8">
            <div className="mb-6 flex justify-center">
              <GkhqMark className="size-[5.5rem]" alt="GKHQ Mentor Hub" />
            </div>

            {MAINTENANCE_MODE && (
              <div
                role="status"
                className="mb-6 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-ink">
                  Temporary maintenance
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Access is currently limited while final updates are completed. We expect the
                  platform to be live again within the next couple of hours.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  If you have any questions, please contact{" "}
                  <span className="font-semibold text-foreground">Luke</span>.
                </p>
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {view === "signin" && (
                <motion.div key="signin" {...viewMotion}>
                  <div className="mb-8 text-center">
                    <h1 className="text-3xl font-display font-bold tracking-[0.01em] leading-tight">
                      Welcome Back
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Sign in to your Mentor Hub account
                    </p>
                  </div>

                  <form onSubmit={handleSignIn} className="space-y-5" noValidate>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="email"
                          type="email"
                          autoComplete="email"
                          required
                          autoFocus
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setError(null);
                          }}
                          placeholder="you@gkhq.app"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="password" className="block text-sm font-medium">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => setView("forgot")}
                          className="min-h-11 -my-3 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="password"
                          type={showPw ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setError(null);
                          }}
                          placeholder="Enter your password"
                          className={`${inputClass} pr-12`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          aria-label={showPw ? "Hide password" : "Show password"}
                          className="absolute right-1 top-1/2 size-11 -translate-y-1/2 grid place-items-center text-muted-foreground hover:text-foreground"
                        >
                          {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div
                        role="alert"
                        className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
                      >
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="group relative w-full h-12 overflow-hidden rounded-xl bg-gradient-to-b from-[#3fd92f] via-primary to-[#0b8f00] text-primary-foreground text-sm font-semibold ring-1 ring-inset ring-white/20 shadow-[0_0_10px_-6px_var(--primary),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-3px_8px_rgba(0,0,0,0.2)] transition-[filter,transform,box-shadow] duration-300 hover:brightness-105 hover:shadow-[0_0_20px_-6px_var(--primary),0_6px_14px_-8px_var(--primary),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-3px_8px_rgba(0,0,0,0.2)] active:scale-[0.99] disabled:opacity-60"
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-t-[10px] rounded-b-[40%] bg-gradient-to-b from-white/45 to-white/0 opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-[left,opacity] duration-700 group-hover:left-[110%] group-hover:opacity-100 motion-reduce:hidden"
                      />
                      <span className="relative flex items-center justify-center gap-2 drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
                        {submitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Signing in…
                          </>
                        ) : (
                          "Sign in"
                        )}
                      </span>
                    </button>
                  </form>

                  {/* The divider and the Google button travel together: an OR with
                      nothing on the far side of it is worse than neither. See
                      `GOOGLE_SIGN_IN_ENABLED` for what has to be true to show them. */}
                  {GOOGLE_SIGN_IN_ENABLED && (
                    <>
                      {/* Two equal flex rules rather than a label painted over one
                          line: the card behind is a gradient, so a solid label
                          background would show as a patch. */}
                      <div className="my-6 flex items-center gap-3">
                        <span aria-hidden="true" className="h-px flex-1 bg-border" />
                        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Or continue with
                        </span>
                        <span aria-hidden="true" className="h-px flex-1 bg-border" />
                      </div>

                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={googleSubmitting}
                        className="w-full flex items-center justify-center gap-2.5 h-11 rounded-xl border border-border bg-background text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors disabled:opacity-60"
                      >
                        <GoogleMark className="size-4 shrink-0" />
                        {googleSubmitting ? "Redirecting to Google…" : "Google"}
                      </button>
                    </>
                  )}

                  <p className="mt-8 text-center text-[11px] text-muted-foreground leading-relaxed">
                    Mentor Hub accounts are provisioned by an administrator. If you need access,
                    contact{" "}
                    <a
                      href="mailto:Luke@Sprintlabs.uk"
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      Luke@Sprintlabs.uk
                    </a>
                    .
                  </p>
                </motion.div>
              )}

              {view === "forgot" && (
                <motion.div key="forgot" {...viewMotion}>
                  <div className="mb-8 text-center">
                    <h1 className="text-2xl font-display font-bold tracking-[0.01em] leading-tight">
                      Reset your password
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      Enter your email and we'll send you a link to reset your password.
                    </p>
                  </div>

                  <form onSubmit={handleForgotSubmit} className="space-y-5">
                    <div>
                      <label htmlFor="reset-email" className="block text-sm font-medium mb-1.5">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="reset-email"
                          type="email"
                          required
                          autoFocus
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="you@gkhq.app"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Send reset link
                    </button>

                    <button
                      type="button"
                      onClick={() => setView("signin")}
                      className="w-full flex items-center justify-center gap-1.5 min-h-11 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="size-3.5" />
                      Back to sign in
                    </button>
                  </form>
                </motion.div>
              )}

              {view === "sent" && (
                <motion.div key="sent" {...viewMotion} className="text-center">
                  <div className="mx-auto mb-5 size-14 rounded-full bg-primary/10 grid place-items-center">
                    <MailCheck className="size-7 text-primary-ink" />
                  </div>
                  <h1 className="text-2xl font-display font-bold tracking-[0.01em] leading-tight">
                    Check your inbox
                  </h1>
                  <p className="mt-2 mb-8 text-sm text-muted-foreground leading-relaxed">
                    If an account exists for{" "}
                    <span className="text-foreground font-medium">{sentTo}</span>, you'll receive a
                    reset link shortly.
                  </p>

                  <button
                    type="button"
                    onClick={() => setView("signin")}
                    className="w-full flex items-center justify-center gap-1.5 h-11 rounded-xl border border-border bg-background hover:bg-accent text-sm font-medium"
                  >
                    <ArrowLeft className="size-4" />
                    Back to sign in
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </MotionConfig>
    </main>
  );
}
