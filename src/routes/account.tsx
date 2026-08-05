import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { KeyRound, Loader2, Check, X, AlertCircle, Shield } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { PageHeader, Card } from "@/components/primitives";
import { changePassword } from "@/lib/account.functions";
import { toast } from "sonner";

type StrengthLevel = 0 | 1 | 2 | 3 | 4;
type Rule = { id: string; label: string; test: (pw: string) => boolean };

const RULES: Rule[] = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "Uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "Lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "num", label: "Number", test: (p) => /\d/.test(p) },
  { id: "sym", label: "Symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const LEVELS: { label: string; className: string; bar: string }[] = [
  { label: "Very weak", className: "text-destructive", bar: "bg-destructive" },
  { label: "Weak", className: "text-destructive", bar: "bg-destructive" },
  { label: "Fair", className: "text-warning", bar: "bg-warning" },
  { label: "Good", className: "text-gk-green", bar: "bg-gk-green" },
  { label: "Strong", className: "text-gk-green", bar: "bg-gk-green" },
];

function scorePassword(pw: string, disqualifiers: string[] = []): StrengthLevel {
  if (!pw) return 0;
  const passed = RULES.filter((r) => r.test(pw)).length;
  let score = passed - 1; // 5 rules -> up to 4
  if (pw.length >= 12) score += 1;
  if (disqualifiers.some((d) => d && pw.toLowerCase() === d.toLowerCase())) score = 0;
  return Math.max(0, Math.min(4, score)) as StrengthLevel;
}


export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "Account · Mentor Hub" },
      { name: "description", content: "Manage your Mentor Hub account and password." },
    ],
  }),
});

function AccountPage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" search={{ next: "" }} />;

  const changePasswordFn = useServerFn(changePassword);

  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const sameAsCurrent = pw.length > 0 && pw === current;
  const strength = useMemo(
    () => scorePassword(pw, [user?.email ?? "", user?.name ?? "", current]),
    [pw, current, user?.email, user?.name],
  );
  const canSubmit =
    current.length > 0 &&
    pw.length >= 8 &&
    pw === confirm &&
    !sameAsCurrent &&
    strength >= 2 &&
    !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setOk(false);
    try {
      await changePasswordFn({ data: { currentPassword: current, newPassword: pw } });
      setOk(true);
      setCurrent("");
      setPw("");
      setConfirm("");
      toast.success("Password updated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update password";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const initials = (user?.name ?? user?.email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <PageHeader title="Account" description="Manage your sign-in credentials." />

      <Card className="p-4 relative overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:bg-primary">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3 sm:flex sm:flex-wrap sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold tracking-wider">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{user?.name ?? "—"}</div>
            <div className="font-mono text-xs text-muted-foreground truncate">{user?.email ?? "—"}</div>
          </div>
          <span className="col-span-2 shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-accent/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Shield className="size-3" />
            {user?.role ?? "—"}
          </span>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Change password</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Confirm your current password, then set a new one of at least 8 characters.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Current password</label>
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setOk(false); }}
              className="w-full h-10 px-3 rounded-md bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Enter your current password"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">New password</label>
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setOk(false); }}
              aria-invalid={tooShort || sameAsCurrent || undefined}
              className="w-full h-10 px-3 rounded-md bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 aria-invalid:border-destructive/70"
              placeholder="At least 8 characters"
              required
              minLength={8}
            />

            {pw.length > 0 && (
              <div className="space-y-2 pt-2 rounded-md border border-border/60 bg-accent/20 p-3">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength ? LEVELS[strength].bar : "bg-border/70"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={LEVELS[strength].className}>
                    Strength: {LEVELS[strength].label}
                  </span>
                  <span className="text-muted-foreground">{pw.length} chars</span>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {RULES.map((r) => {
                    const passed = r.test(pw);
                    return (
                      <li
                        key={r.id}
                        className={`flex items-center gap-1.5 min-w-0 ${
                          passed ? "text-gk-green" : "text-muted-foreground"
                        }`}
                      >
                        {passed ? <Check className="size-3 shrink-0" /> : <X className="size-3 opacity-60 shrink-0" />}
                        <span className="truncate">{r.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {tooShort && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="size-3" />
                Password must be at least 8 characters.
              </p>
            )}
            {sameAsCurrent && !tooShort && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="size-3" />
                New password must differ from your current password.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Confirm new password</label>
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setOk(false); }}
              aria-invalid={mismatch || undefined}
              className="w-full h-10 px-3 rounded-md bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 aria-invalid:border-destructive/70"
              placeholder="Repeat new password"
              required
            />
            {mismatch ? (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="size-3" />
                Passwords do not match.
              </p>
            ) : confirm.length > 0 && pw.length > 0 && !mismatch ? (
              <p className="flex items-center gap-1 text-[11px] text-gk-green">
                <Check className="size-3" />
                Passwords match.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none shrink-0">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="rounded border-border bg-input shrink-0" />
              Show passwords
            </label>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 w-full sm:w-auto px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : ok ? <Check className="size-4" /> : <KeyRound className="size-4" />}
              {busy ? "Updating…" : ok ? "Updated" : "Update password"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
