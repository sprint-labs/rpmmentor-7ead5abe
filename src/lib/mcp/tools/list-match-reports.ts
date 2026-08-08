import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export default defineTool({
  name: "list_match_reports",
  title: "List match reports",
  description:
    "List recent Mentor Hub match reports the signed-in user is allowed to see under Row Level Security. Returns goalkeeper, opponent, match date, coach and overall average.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 25)."),
    goalkeeper: z.string().trim().min(1).optional().describe("Filter by goalkeeper name (case-insensitive contains)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, goalkeeper }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    // The canonical Match Report store. Tombstoned reports are excluded so the
    // tool can never surface a report the app itself no longer shows.
    let q = supabase
      .from("match_reports_cache")
      .select("report_id,goalkeeper,team,opponent,match_date,coach,average")
      .is("deleted_at", null)
      .order("match_date", { ascending: false, nullsFirst: false })
      .limit(limit ?? 25);
    if (goalkeeper) q = q.ilike("goalkeeper", `%${goalkeeper}%`);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { reports: data ?? [] },
    };
  },
});
