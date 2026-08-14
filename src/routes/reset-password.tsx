import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordPasswordRecovery } from "@/lib/account.functions";
import loginLogo from "@/assets/gkhq-design-system.svg.asset.json";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password · Mentor Hub" },
      { name: "description", content: "Set a new password for your Mentor Hub account." },
    ],
  }),
});

type Status = "checking" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Recovery links land here with a hash like `#access_token=...&type=recovery`.
  // Supabase's client parses it automatically and fires PASSWORD_RECOVERY, giving
  // us a short-lived session that can only be used to update the password.
  useEffect(() => {
    let settled = false;

    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setStatus("ready");
      }
    });

    // Fallback: if the hash contains a recovery token or we already have a
    // session (e.g. user opened this page while signed in to change password),
    // allow the reset form.
    (async () => {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const isRecoveryHash = hash.includes("type=recovery") || hash.includes("type=invite");
      const { data } = await supabase.auth.getSession();
      if (settled) return;
      if (isRecoveryHash || data.session) {
        setStatus("ready");
      } else {
        setStatus("invalid");
      }
    })();

    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setSubmitting(false);
    if (err) {
      setError(err.message || "Could not update password.");
      return;
    }
    // Best-effort audit log before we tear down the recovery session.
    try {
      await recordPasswordRecovery();
    } catch {
      // don't block the user on audit failures
    }
    // Sign the temporary recovery session out so the user must sign in with
    // the new password.
    await supabase.auth.signOut();
    setStatus("done");
    setTimeout(() => navigate({ to: "/login", search: { next: "" }, replace: true }), 1600);
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen flex items-center justify-center bg-background p-6"
    >
      <div className="w-full max-w-md">
        <div className="mb-10">
          <img src={loginLogo.url} alt="Mentor Hub by RPM" className="h-40 w-auto" />
        </div>

        {status === "checking" && (
          <div className="text-sm text-muted-foreground">Verifying reset link…</div>
        )}

        {status === "invalid" && (
          <>
            <div className="mb-8">
              <h1 className="text-4xl font-display font-bold uppercase tracking-[0.02em] leading-tight">
                Link expired
              </h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                This password reset link is invalid or has expired. Request a new one from the
                sign-in screen.
              </p>
            </div>
            <Link
              to="/login"
              search={{ next: "" }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-card hover:bg-accent/30 text-sm font-medium"
            >
              <ArrowLeft className="size-4" />
              Back to sign in
            </Link>
          </>
        )}

        {status === "ready" && (
          <>
            <div className="mb-8">
              <h1 className="text-4xl font-display font-bold uppercase tracking-[0.02em] leading-tight">
                Set a new password
              </h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Choose a new password for your Mentor Hub account. You'll be signed in with it after
                this.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="pw" className="block text-xs font-medium mb-1.5">
                  New password
                </label>
                <div className="relative">
                  <Lock className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="pw"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    autoFocus
                    required
                    minLength={8}
                    value={pw}
                    onChange={(e) => {
                      setPw(e.target.value);
                      setError(null);
                    }}
                    placeholder="At least 8 characters"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 size-11 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm" className="block text-xs font-medium mb-1.5">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="confirm"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError(null);
                    }}
                    placeholder="Repeat new password"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition"
                  />
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {submitting ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}

        {status === "done" && (
          <>
            <div className="mb-8">
              <div className="size-12 rounded-xl bg-secondary grid place-items-center mb-5">
                <CheckCircle2 className="size-6 text-primary" />
              </div>
              <h1 className="text-4xl font-display font-bold uppercase tracking-[0.02em] leading-tight">
                Password updated
              </h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Your password has been reset. Redirecting you to sign in…
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
