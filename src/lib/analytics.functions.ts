import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const logInput = z.object({
  source: z.string().min(1).max(64),
  destination: z.string().min(1).max(128),
  periodDays: z.number().int().positive().max(365).optional(),
  periodFrom: z.string().optional(),
  periodTo: z.string().optional(),
  mentorProfileId: z.string().optional(),
  mentorName: z.string().optional(),
  effectiveRole: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const logDashboardClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof logInput>) => logInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("dashboard_click_events").insert({
      user_id: userId,
      source: data.source,
      destination: data.destination,
      period_days: data.periodDays ?? null,
      period_from: data.periodFrom ?? null,
      period_to: data.periodTo ?? null,
      mentor_profile_id: data.mentorProfileId ?? null,
      mentor_name: data.mentorName ?? null,
      effective_role: data.effectiveRole ?? null,
      metadata: (data.metadata ?? {}) as never,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
