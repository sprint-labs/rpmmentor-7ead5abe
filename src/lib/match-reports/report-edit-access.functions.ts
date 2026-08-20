import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { averageOfScores, matchReportEditSchema, type MatchReportRow } from "./schema";
import { matchReportInteractionNotes } from "@/lib/interactions/match-report-link";
import {
  getUserRoles,
  hasAnyRole,
  REPORT_MANAGE_ROLES,
  REPORT_SUBMIT_ROLES,
  type AppRole,
} from "@/lib/roles.server";

export interface MatchReportEditAccess {
  canManage: boolean;
  isAuthor: boolean;
  canEdit: boolean;
}

/**
 * Decide edit access from authenticated database facts only.
 *
 * Management roles may correct any report. Authorship is a fallback for a
 * current operational user, so removing someone's RPM role also revokes their
 * author-edit access without rewriting report history.
 */
export function decideMatchReportEditAccess(input: {
  roles: readonly AppRole[];
  userId: string;
  submittedBy: string | null | undefined;
}): MatchReportEditAccess {
  const canManage = hasAnyRole(input.roles, REPORT_MANAGE_ROLES);
  const hasActiveOperationalRole = hasAnyRole(input.roles, REPORT_SUBMIT_ROLES);
  const isAuthor =
    hasActiveOperationalRole && !!input.submittedBy && input.submittedBy === input.userId;

  return { canManage, isAuthor, canEdit: canManage || isAuthor };
}

/**
 * Row-aware Match Report editing.
 *
 * Management roles keep their existing ability to correct any report. Every
 * other operational role may correct only a report that was submitted by their
 * own authenticated user id. There is deliberately no time limit for now.
 *
 * Ownership is verified server-side against match_reports_cache.submitted_by.
 * Coach/display names are never used for authorisation.
 */
export const getMatchReportEditAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { reportId: string }) =>
    z.object({ reportId: z.string().trim().min(1).max(160) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CANONICAL_TABLE, getCanonicalReport } = await import("./store.server");
    const report = await getCanonicalReport(supabaseAdmin, data.reportId);
    if (!report) {
      return {
        canManage: hasAnyRole(roles, REPORT_MANAGE_ROLES),
        isAuthor: false,
        canEdit: false,
      } satisfies MatchReportEditAccess;
    }

    const { data: ownerRow, error } = await supabaseAdmin
      .from(CANONICAL_TABLE)
      .select("submitted_by")
      .eq("report_id", report.report_id)
      .maybeSingle();
    if (error) throw new Error("Could not verify report ownership.");

    return decideMatchReportEditAccess({
      roles,
      userId,
      submittedBy: (ownerRow as { submitted_by: string | null } | null)?.submitted_by,
    });
  });

export type UpdateOwnedMatchReportResult =
  | { updated: true; report: MatchReportRow; interaction_error?: string }
  | { updated: false; report: null; reason: "not_found" };

export const updateOwnedMatchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => matchReportEditSchema.parse(data))
  .handler(async ({ data, context }): Promise<UpdateOwnedMatchReportResult> => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CANONICAL_TABLE, getCanonicalReport, updateCanonicalReport } =
      await import("./store.server");

    // Resolve legacy/base ids first, then authorise against the exact canonical
    // row that will be updated.
    const existing = await getCanonicalReport(supabaseAdmin, data.reportId);
    if (!existing) {
      return { updated: false, report: null, reason: "not_found" };
    }

    let access = decideMatchReportEditAccess({ roles, userId, submittedBy: null });
    if (!access.canManage) {
      const { data: ownerRow, error: ownerError } = await supabaseAdmin
        .from(CANONICAL_TABLE)
        .select("submitted_by")
        .eq("report_id", existing.report_id)
        .maybeSingle();
      if (ownerError) throw new Error("Could not verify report ownership.");

      access = decideMatchReportEditAccess({
        roles,
        userId,
        submittedBy: (ownerRow as { submitted_by: string | null } | null)?.submitted_by,
      });
    }
    if (!access.canEdit) {
      throw new Error(
        "You can only edit your own Match Reports while you have active mentor access.",
      );
    }

    const average = averageOfScores(data.scores);
    const comments = data.comments.trim();
    const saved = await updateCanonicalReport(supabaseAdmin, {
      reportId: existing.report_id,
      scores: data.scores,
      average,
      comments,
    });
    if (!saved.updated) {
      return { updated: false, report: null, reason: "not_found" };
    }

    // Keep the auto-created Live Match Observation in sync with the corrected
    // report. A failure here does not undo the report edit, but it is surfaced
    // to the caller so an administrator can follow it up.
    const { error: interactionError } = await supabaseAdmin
      .from("interactions")
      .update({
        notes: matchReportInteractionNotes({
          opponent: saved.report.opponent ?? "",
          competition: saved.report.competition ?? "",
          average,
          comments,
        }),
        updated_by: userId,
      })
      .eq("match_report_id", saved.report.report_id)
      .is("deleted_at", null);

    if (interactionError) {
      console.error(
        "[match-reports] interaction refresh after report edit failed:",
        interactionError,
      );
    }

    return {
      updated: true,
      report: saved.report,
      ...(interactionError ? { interaction_error: interactionError.message } : {}),
    };
  });
