import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 1 auth smoke tests — regressions here mean the pilot login flow is
 * broken. Covers:
 *   - sign-in with valid credentials
 *   - retry after an invalid-password attempt (no lockout, error surfaced)
 *   - session persistence across a fresh client using the returned tokens
 *   - sign-out clears the session
 *
 * Requires TEST_MENTOR_EMAIL / TEST_MENTOR_PASSWORD in .env.local. Missing
 * credentials skip the suite rather than fail the run.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

const email = process.env.TEST_MENTOR_EMAIL;
const password = process.env.TEST_MENTOR_PASSWORD;

const suite =
  SUPABASE_URL && SUPABASE_KEY && email && password ? describe : describe.skip;

function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });
}

suite("auth :: phase 1 smoke", () => {
  // Built in beforeAll, not at collection time: a skipped describe still
  // evaluates its body, and makeClient() throws without a Supabase URL.
  let client: SupabaseClient;

  beforeAll(() => {
    client = makeClient();
  });

  afterAll(async () => {
    await client?.auth.signOut().catch(() => {});
  });

  it("rejects an invalid password and allows an immediate retry with the correct one", async () => {
    const bad = await client.auth.signInWithPassword({
      email: email!,
      password: `${password!}-wrong`,
    });
    expect(bad.error).toBeTruthy();
    expect(bad.data.session).toBeNull();

    const good = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    expect(good.error).toBeNull();
    expect(good.data.session?.access_token).toBeTruthy();
    expect(good.data.user?.email?.toLowerCase()).toBe(email!.toLowerCase());
  });

  it("exposes the signed-in session via getSession / getUser", async () => {
    const { data: sess } = await client.auth.getSession();
    expect(sess.session?.access_token).toBeTruthy();

    const { data: usr, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(usr.user?.id).toBeTruthy();
  });

  it("persists the session when rehydrated into a fresh client via setSession", async () => {
    const { data } = await client.auth.getSession();
    const access_token = data.session!.access_token;
    const refresh_token = data.session!.refresh_token;

    const fresh = makeClient();
    const restored = await fresh.auth.setSession({
      access_token,
      refresh_token,
    });
    expect(restored.error).toBeNull();
    expect(restored.data.session?.access_token).toBe(access_token);

    const { data: usr, error } = await fresh.auth.getUser();
    expect(error).toBeNull();
    expect(usr.user?.id).toBeTruthy();

    await fresh.auth.signOut().catch(() => {});
  });

  it("signs out and clears the session", async () => {
    const { error } = await client.auth.signOut();
    expect(error).toBeNull();
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
  });
});
