import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Beta namespace: keep a local typed shim rather than digging into SDK internals.
interface OAuthAuthorizationDetails {
  client?: { name?: string; redirect_uris?: string[] } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
  scopes?: string[] | null;
}
interface OAuthDecisionResult {
  redirect_url?: string | null;
  redirect_to?: string | null;
}
type OAuthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OAuthAuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthDecisionResult | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthDecisionResult | null; error: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-sm text-destructive">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  const redirectUri = details?.client?.redirect_uris?.[0] ?? null;
  const scopes =
    details?.scopes ??
    (typeof details?.scope === "string" && details.scope
      ? details.scope.split(/\s+/).filter(Boolean)
      : []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <img src="/gkhq-lockup.svg" alt="Mentor Hub by RPM" className="h-16 w-auto" />
        </div>

        <h1 className="text-3xl font-display font-bold uppercase tracking-[0.02em] leading-tight">
          Connect {clientName} to Mentor Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          This lets {clientName} use Mentor Hub as you. Access is limited by your account's
          permissions and Row Level Security — nothing bypasses them.
        </p>

        {redirectUri && (
          <p className="text-[11px] text-muted-foreground mt-4 break-all">
            Redirect URI: <span className="text-foreground">{redirectUri}</span>
          </p>
        )}

        {scopes.length > 0 && (
          <ul className="mt-6 space-y-1.5 text-xs">
            {scopes.map((s: string) => (
              <li key={s} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground">{s}</span>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="mt-6 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold uppercase tracking-[0.06em] hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="w-full py-2.5 rounded-xl border border-border bg-card text-sm font-semibold uppercase tracking-[0.06em] hover:bg-accent/30 transition-colors disabled:opacity-60"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
