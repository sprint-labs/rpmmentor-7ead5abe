import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Pill } from "@/components/primitives";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Video,
  Image as ImageIcon,
  Mic,
  ExternalLink,
  Loader2,
  Paperclip,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listReportAttachmentsForIds, openAsset, type MediaAsset } from "@/lib/media-store";
import { reportCoverageQueryKey } from "@/lib/calendar/report-coverage";
import { refreshInteractionViews } from "@/lib/query-refresh";
import { useAuth } from "@/lib/auth";
import {
  deleteMatchReport,
  getMatchReport,
  listMatchReports,
} from "@/lib/match-reports/reports.functions";
import { goalkeeperForm } from "@/lib/match-reports/goalkeeper-form";
import { listPlayers } from "@/lib/players.functions";
import { toGoalkeepers } from "@/lib/roster/live-goalkeepers";
import { normalisePersonName } from "@/lib/goalkeeper-player-link";
import { scoreTone } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import {
  FormStrip,
  MentorVerdict,
  PillarBreakdown,
  PillarStandouts,
  PlayerSnapshot,
  ReportHero,
} from "@/components/reports/report-detail";
import {
  getMatchReportEditAccess,
  updateOwnedMatchReport,
} from "@/lib/match-reports/report-edit-access.functions";
import {
  PILLAR_IDS,
  PILLAR_LABELS,
  type MatchReportRow,
  type PillarId,
} from "@/lib/match-reports/schema";

export const Route = createFileRoute("/reports/$reportId")({
  component: ReportDetail,
  notFoundComponent: () => (
    <Card className="p-10 text-center text-sm text-muted-foreground">Report not found.</Card>
  ),
  errorComponent: ({ error }) => (
    <Card className="p-10 text-center text-sm text-destructive">{error.message}</Card>
  ),
});

const ICON: Record<string, typeof FileText> = {
  video: Video,
  pdf: FileText,
  image: ImageIcon,
  audio: Mic,
};

function editableScores(report: MatchReportRow): Record<PillarId, number> {
  const scores = {} as Record<PillarId, number>;
  for (const id of PILLAR_IDS) scores[id] = report.scores[id] ?? 3;
  return scores;
}

function ReportDetail() {
  const { reportId } = Route.useParams();
  const { user, can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getMatchReport);
  const getEditAccessFn = useServerFn(getMatchReportEditAccess);
  const updateFn = useServerFn(updateOwnedMatchReport);
  const deleteFn = useServerFn(deleteMatchReport);

  const { data, isLoading, error } = useQuery({
    queryKey: ["match-report", reportId],
    queryFn: () => getFn({ data: { reportId } }),
  });
  const { data: editAccess, error: editAccessError } = useQuery({
    queryKey: ["match-report-edit-access", reportId],
    queryFn: () => getEditAccessFn({ data: { reportId } }),
  });

  const r = data?.report ?? null;

  // The goalkeeper's other reports and his roster record, for the photo, the
  // snapshot stats and the form strip. Both share the keys the Submission
  // Centre already fills, so arriving from there costs no extra request, and
  // neither blocks the report: if one fails, its sections simply stay away.
  const listFn = useServerFn(listMatchReports);
  const { data: allReports } = useQuery({
    queryKey: ["match-reports"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });
  const listPlayersFn = useServerFn(listPlayers);
  const { data: rosterRows } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });

  const goalkeeper = useMemo(() => {
    if (!r) return undefined;
    const target = normalisePersonName(r.goalkeeper);
    return toGoalkeepers(rosterRows).find((gk) => normalisePersonName(gk.name) === target);
  }, [r, rosterRows]);

  const form = useMemo(
    () => (r && allReports ? goalkeeperForm(allReports.reports, r) : null),
    [r, allReports],
  );

  const [attachments, setAttachments] = useState<MediaAsset[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftScores, setDraftScores] = useState<Record<PillarId, number> | null>(null);
  const [draftComments, setDraftComments] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load attachments for EVERY identity this report has ever had: the route id
  // the user arrived on, its current resolved id, and its legacy id. Historic
  // `mr_` attachments therefore stay visible on `mr2_` detail pages.
  const currentId = r?.report_id ?? null;
  const legacyId = r?.legacy_report_id ?? null;

  const loadAttachments = useCallback(async () => {
    setLoadingAttachments(true);
    try {
      setAttachments(await listReportAttachmentsForIds([reportId, currentId, legacyId]));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAttachments(false);
    }
  }, [reportId, currentId, legacyId]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const refreshReportViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["match-report", reportId] }),
      queryClient.invalidateQueries({ queryKey: ["match-report-edit-access", reportId] }),
      queryClient.invalidateQueries({ queryKey: ["match-reports"] }),
      queryClient.invalidateQueries({ queryKey: ["mentor-dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["overview-dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["executive-dashboard-stats"] }),
      // Deleting a report withdraws it as calendar coverage, so the goalkeeper's
      // Match Report badge has to come back.
      queryClient.invalidateQueries({ queryKey: reportCoverageQueryKey }),
      refreshInteractionViews(queryClient),
    ]);
  };

  const openEditor = () => {
    if (!r) return;
    setDraftScores(editableScores(r));
    setDraftComments(r.comments);
    setSaveError(null);
    setEditing(true);
  };

  const saveReport = async () => {
    if (!r || !draftScores) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updateFn({
        data: {
          reportId: r.report_id,
          scores: draftScores,
          comments: draftComments,
        },
      });
      if (!result.updated) {
        setSaveError("This report is no longer available to edit. Refresh the page and try again.");
        return;
      }
      await refreshReportViews();
      setEditing(false);
      toast.success("Match report updated");
      if (result.interaction_error) {
        toast.warning("The report was updated, but its linked interaction could not be refreshed.");
      }
    } catch (saveFailure) {
      setSaveError(
        saveFailure instanceof Error ? saveFailure.message : "Could not update the report.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteReport = async () => {
    if (!r) return;
    setDeleting(true);
    try {
      const result = await deleteFn({ data: { reportId: r.report_id } });
      if (!result.deleted) {
        toast.error("This report is no longer available to delete.");
        return;
      }
      await refreshReportViews();
      setDeleteOpen(false);
      toast.success("Match report deleted");
      if (result.interaction_error) {
        toast.warning(
          "The report was deleted, but its linked observation could not be withdrawn. Delete that interaction separately.",
        );
      }
      if (result.ledger_error) {
        toast.warning("The report was deleted, but its submission ledger needs an admin check.");
      }
      await router.navigate({ to: "/reports" });
    } catch (deleteFailure) {
      toast.error(
        deleteFailure instanceof Error ? deleteFailure.message : "Could not delete the report.",
      );
    } finally {
      setDeleting(false);
    }
  };

  // View As changes presentation only. Show management controls from the
  // effective UI role, while still showing an active author's own Edit action.
  const canEdit = can("reports.manage") || (editAccess?.isAuthor ?? false);
  const canDelete = can("reports.manage");

  if (isLoading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Loading report…</Card>;
  }
  if (error) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">{(error as Error).message}</Card>
    );
  }
  if (!r) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">Report not found.</Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/reports"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          Back to reports
        </Link>
        {(canEdit || canDelete) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canEdit && (
              <Button type="button" size="sm" variant="outline" onClick={openEditor}>
                <Pencil />
                Edit report
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
                Delete report
              </Button>
            )}
          </div>
        )}
      </div>

      <ReportHero report={r} goalkeeper={goalkeeper} />

      {editAccessError && (
        <p className="text-xs text-destructive" role="alert">
          Could not verify edit access. Refresh and try again.
        </p>
      )}

      {form && <PlayerSnapshot report={r} form={form} goalkeeper={goalkeeper} />}

      {editing && draftScores && (
        <Card className="rounded-xl p-4 sm:p-5">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void saveReport();
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  Edit Match Report
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Correct the seven RPM pillar scores and comments. Goalkeeper, fixture and coach
                  details remain unchanged.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                }}
              >
                <X />
                Cancel
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PILLAR_IDS.map((id) => (
                <fieldset key={id} className="rounded-md border border-border p-3">
                  <legend className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {PILLAR_LABELS[id]}
                  </legend>
                  <div
                    className="mt-1 flex gap-1"
                    role="group"
                    aria-label={`${PILLAR_LABELS[id]} score`}
                  >
                    {[1, 2, 3, 4, 5].map((score) => {
                      const selected = draftScores[id] === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          onClick={() =>
                            setDraftScores((current) =>
                              current ? { ...current, [id]: score } : current,
                            )
                          }
                          className={cn(
                            "h-9 flex-1 rounded border text-sm font-mono font-semibold transition-colors",
                            // The picked score takes its band colour, so the
                            // editor reads in the same ramp as the report.
                            selected
                              ? cn("border-transparent text-rating-ink", scoreTone(score).bar)
                              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                          aria-pressed={selected}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Comments
              </span>
              <textarea
                value={draftComments}
                onChange={(event) => setDraftComments(event.target.value)}
                maxLength={5000}
                rows={8}
                className="w-full rounded-md border border-border bg-input/60 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y"
              />
            </label>

            {saveError && (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}Save changes
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <PillarBreakdown report={r} form={form} className="lg:col-span-2" />
        <div className="space-y-4">
          <PillarStandouts report={r} />
          {form && <FormStrip report={r} form={form} />}
        </div>

        <MentorVerdict report={r} className="lg:col-span-2" />

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 lg:self-start">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] font-mono text-foreground">
              <Paperclip className="size-3.5 text-primary-ink" aria-hidden="true" />
              Attached Media
            </h2>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {attachments.length} attached
            </span>
          </div>
          {loadingAttachments ? (
            <div className="text-sm text-muted-foreground py-4">Loading…</div>
          ) : attachments.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              <Video className="size-4 shrink-0" aria-hidden="true" />
              No media attached to this report.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-3">
              {attachments.map((a) => {
                const Icon = ICON[a.media_type] ?? FileText;
                return (
                  <button key={a.id} onClick={() => openAsset(a, user)} className="text-left">
                    <Card className="overflow-hidden hover:border-primary/40 transition-colors">
                      <div className="aspect-video bg-gradient-to-br from-primary/15 via-accent/40 to-muted grid place-items-center relative">
                        <Icon className="size-8 text-muted-foreground" />
                        <ExternalLink className="size-3.5 absolute top-1.5 right-1.5 text-muted-foreground" />
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-medium line-clamp-1">{a.title}</div>
                        <div className="flex items-center justify-between mt-1">
                          <Pill>{a.media_type}</Pill>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(a.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Match Report?</AlertDialogTitle>
            <AlertDialogDescription>
              It and its linked Live Match Observation will be removed from active views. The
              original rows remain retained for audit and recovery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteReport();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
