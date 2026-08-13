import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({
  event: z.enum(["shown", "accepted", "dismissed", "failed", "installed", "manual_close", "retry"]),
  surface: z.enum(["native", "ios", "failure"]),
  platform: z.string().max(64).optional(),
  browser: z.string().max(64).optional(),
  userAgent: z.string().max(512).optional(),
  declines: z.number().int().nonnegative().max(1000).optional(),
  failures: z.number().int().nonnegative().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Deliberately unauthenticated: install events fire for anonymous visitors
// too (they can install from the marketing/landing surface before signing in).
// The row's user_id is nullable; when a session cookie is present we attribute.
export const logInstallEvent = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof input>) => input.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("install_prompt_events").insert({
      user_id: null, // anonymous by default; authed clients can call the dashboard-click helper if they want attribution
      event: data.event,
      surface: data.surface,
      platform: data.platform ?? null,
      browser: data.browser ?? null,
      user_agent: data.userAgent ?? null,
      declines: data.declines ?? 0,
      failures: data.failures ?? 0,
      metadata: (data.metadata ?? {}) as never,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
