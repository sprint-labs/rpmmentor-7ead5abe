/**
 * Integration status for the Google Sheets connector.
 *
 * The Sheet is a dormant archive/rollback source — no Match Report read or
 * write depends on it at runtime. This reports whether the connector is still
 * linked, whether we can reach the archive through the Lovable gateway, and
 * when its history was last imported into the canonical Supabase store.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SheetsIntegrationStatus = {
  connector: "google_sheets";
  linked: boolean;
  reachable: boolean;
  spreadsheetId: string;
  spreadsheetTitle: string | null;
  sheetTab: string;
  sheetTabExists: boolean;
  /** Actual A1:O1 header row from the sheet (empty when unreachable). */
  headerRow: string[];
  /** Columns whose header text differs from SHEET_HEADERS. */
  headerMismatches: { column: string; expected: string; actual: string }[];
  /** When the sheet archive was last imported into Supabase. */
  lastWriteAt: string | null; // ISO
  /** Canonical reports that originated from the sheet archive. */
  totalWrites: number;
  checkedAt: string; // ISO
  error: string | null;
};

export const getSheetsIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SheetsIntegrationStatus> => {
    const { supabase, userId } = context;

    // Super-admin only — mirrors other /system routes.
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Unable to verify caller role.");
    const roles = (roleRows ?? []).map((r) => r.role as string);
    if (!roles.includes("super_admin")) {
      throw new Error("Forbidden: super_admin role required.");
    }

    const { SHEET_ID, SHEET_TAB, SHEET_HEADERS } = await import("@/lib/match-reports/schema");
    const checkedAt = new Date().toISOString();

    const lovable = process.env.LOVABLE_API_KEY;
    const conn = process.env.GOOGLE_SHEETS_API_KEY;
    const linked = Boolean(lovable && conn);

    let reachable = false;
    let spreadsheetTitle: string | null = null;
    let sheetTabExists = false;
    let error: string | null = null;
    let headerRow: string[] = [];
    let headerMismatches: { column: string; expected: string; actual: string }[] = [];

    if (linked) {
      try {
        const res = await fetch(
          `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SHEET_ID}?fields=properties(title),sheets(properties(title))`,
          {
            headers: {
              Authorization: `Bearer ${lovable}`,
              "X-Connection-Api-Key": conn as string,
            },
          },
        );
        if (!res.ok) {
          error = `Gateway ${res.status}: ${(await res.text()).slice(0, 300)}`;
        } else {
          reachable = true;
          const body = (await res.json()) as {
            properties?: { title?: string };
            sheets?: Array<{ properties?: { title?: string } }>;
          };
          spreadsheetTitle = body.properties?.title ?? null;
          sheetTabExists = (body.sheets ?? []).some(
            (s) => s.properties?.title === SHEET_TAB,
          );
        }
      } catch (e) {
        error = e instanceof Error ? e.message : "Unknown gateway error";
      }

      // Positional integrity check — the sheet is editable outside this app, so
      // a renamed/inserted column would silently mis-map every read.
      if (reachable && sheetTabExists) {
        try {
          const { readHeaderRow } = await import("@/lib/match-reports/sheets.server");
          headerRow = await readHeaderRow();
          headerMismatches = SHEET_HEADERS.flatMap((expected, i) => {
            const actual = (headerRow[i] ?? "").trim();
            if (actual === expected) return [];
            return [{ column: String.fromCharCode(65 + i), expected, actual }];
          });
        } catch (e) {
          console.error("[integrations] header check failed:", e);
        }
      }
    } else {
      error = "Connector not linked (missing LOVABLE_API_KEY or GOOGLE_SHEETS_API_KEY).";
    }

    // Last import of the archive, tracked by `synced_at` on the sheet-sourced
    // canonical rows. Failures here don't block the status response.
    let lastWriteAt: string | null = null;
    let totalWrites = 0;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: last } = await supabaseAdmin
        .from("match_reports_cache")
        .select("synced_at")
        .eq("source", "sheet")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastWriteAt = (last?.synced_at as string | null) ?? null;
      const { count } = await supabaseAdmin
        .from("match_reports_cache")
        .select("report_id", { count: "exact", head: true })
        .eq("source", "sheet");
      totalWrites = count ?? 0;
    } catch {
      /* non-fatal */
    }

    return {
      connector: "google_sheets",
      linked,
      reachable,
      spreadsheetId: SHEET_ID,
      spreadsheetTitle,
      sheetTab: SHEET_TAB,
      sheetTabExists,
      headerRow,
      headerMismatches,
      lastWriteAt,
      totalWrites,
      checkedAt,
      error,
    };
  });
