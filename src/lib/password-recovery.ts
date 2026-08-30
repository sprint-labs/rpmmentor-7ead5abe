import { canonicalUrl } from "@/lib/canonical-url";

export const PASSWORD_RECOVERY_PATH = "/reset-password";

export function passwordRecoveryRedirectUrl(): string {
  return canonicalUrl(PASSWORD_RECOVERY_PATH);
}

export function parseAuthCallbackParams(location: Pick<Location, "hash" | "search">) {
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(location.search);
  return { hashParams, queryParams };
}

/** True when the current URL looks like a Supabase recovery or invite callback. */
export function isRecoveryCallback(location: Pick<Location, "hash" | "search">): boolean {
  const { hashParams, queryParams } = parseAuthCallbackParams(location);
  const type = hashParams.get("type") ?? queryParams.get("type");
  return type === "recovery" || type === "invite";
}

/** True when the URL carries auth callback material (hash tokens or PKCE code). */
export function hasAuthCallback(location: Pick<Location, "hash" | "search">): boolean {
  const { hashParams, queryParams } = parseAuthCallbackParams(location);
  return !!(
    queryParams.get("code") ||
    hashParams.get("access_token") ||
    queryParams.get("token_hash")
  );
}
