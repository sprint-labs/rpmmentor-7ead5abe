import { getRequest, getRequestHeader } from "@tanstack/react-start/server";

export type PasswordChangeEvent = "self_change" | "admin_reset" | "recovery_reset";

/**
 * Record a password change to the audit log. Best-effort: failure to write
 * the audit row must not block the password change itself.
 */
export async function logPasswordChange(params: {
  userId: string;
  actorId: string | null;
  eventType: PasswordChangeEvent;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const req = getRequest();
      userAgent = req.headers.get("user-agent");
      ip =
        getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
        getRequestHeader("cf-connecting-ip") ??
        getRequestHeader("x-real-ip") ??
        null;
    } catch {
      // no request context (e.g. background); leave null
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("password_change_audit").insert({
      user_id: params.userId,
      actor_id: params.actorId,
      event_type: params.eventType,
      ip_address: ip,
      user_agent: userAgent,
      metadata: (params.metadata ?? {}) as never,
    });
  } catch (err) {
    console.error("[password-audit] failed to record event", err);
  }
}
