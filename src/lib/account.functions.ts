import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
});

/**
 * Change the caller's password after re-verifying their current password
 * server-side. Verification is done with an isolated publishable-key client
 * (no session persistence) so a wrong current password can never affect the
 * caller's real session. Only after that succeeds do we update the password
 * with the admin client.
 */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => changePasswordSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { currentPassword, newPassword } = data;

    if (currentPassword === newPassword) {
      throw new Error("New password must be different from the current password.");
    }

    // Resolve the caller's email from the authenticated context.
    const { data: userData, error: userErr } = await context.supabase.auth.getUser();
    if (userErr || !userData?.user?.email) {
      throw new Error("Could not resolve current account.");
    }
    const email = userData.user.email;

    // Verify current password using a throwaway publishable-key client.
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { error: signInErr } = await verifier.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    // Always sign out the throwaway client, regardless of outcome.
    await verifier.auth.signOut().catch(() => {});

    if (signInErr) {
      throw new Error("Current password is incorrect.");
    }

    // Now update the password using the admin client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: newPassword,
    });
    if (updErr) {
      throw new Error(updErr.message || "Could not update password.");
    }

    const { logPasswordChange } = await import("@/lib/security/password-audit.server");
    await logPasswordChange({
      userId: context.userId,
      actorId: context.userId,
      eventType: "self_change",
    });

    return { ok: true as const };
  });

/**
 * Record that the caller just completed a password reset via the recovery
 * (email link) flow. The recovery link gives the user a short-lived
 * authenticated session, so requireSupabaseAuth is sufficient.
 */
export const recordPasswordRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { logPasswordChange } = await import("@/lib/security/password-audit.server");
    await logPasswordChange({
      userId: context.userId,
      actorId: context.userId,
      eventType: "recovery_reset",
    });
    return { ok: true as const };
  });
