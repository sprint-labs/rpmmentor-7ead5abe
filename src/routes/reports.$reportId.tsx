import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Card, Pill } from "@/components/primitives";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Video, Image as ImageIcon, Mic, ExternalLink, Loader2, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { listReportAttachmentsForIds, openAsset, type MediaAsset } from "@/lib/media-store";
import { useAuth } from "@/lib/auth";
import { getMatchReport } from "@/lib/match-reports/reports.functions";
import { PILLAR_IDS, PILLAR_LABELS } from "@/lib/match-reports/schema";
import { analyzeReport, type StructuredAnalysis } from "@/lib/api/summarize.functions";

export const Route = createFileRoute("/reports/$reportId")({
  component: ReportDetail,
  notFoundComponent: () => (
    <Card className="p-10 text-center text-sm text-muted-foreground">Report not found.</Card>
  ),
  errorComponent: ({ error }) => (
    <Card className="p-10 text-center text-sm text-destructive">{error.message}</Card>
  ),
});

const ICON: Record<string, typeof FileText> = { video: Video, pdf: FileText, image: ImageIcon, audio: Mic };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ReportDetail() {
  const { reportId } = Route.useParams();
  const { user } = useAuth();
  const getFn = useServerFn(getMatchReport);
  const analyzeFn = useServerFn(analyzeReport);

  const { data, isLoading, error } = useQuery({
    queryKey: ["match-report", reportId],
    queryFn: () => getFn({ data: { reportId } }),
  });

  const r = data?.report ?? null;

  const [attachments, setAttachments] = useState<MediaAsset[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [analysis, setAnalysis] = useState<StructuredAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Load attachments for EVERY identity this report has ever had: the route id
  // the user arrived on, its current resolved id, and its legacy id. Historic
  // `mr_` attachments therefore stay visible on `mr2_` detail pages.
  const currentId = r?.report_id ?? null;
  const legacyId = r?.legacy_report_id ?? null;

  const loadAttachments = useCallback(async () => {
    setLoadingAttachments(true);
    try { setAttachments(await listReportAttachmentsForIds([reportId, currentId, legacyId])); }
    catch (e) { console.error(e); }
    finally { setLoadingAttachments(false); }
  }, [reportId, currentId, legacyId]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  const generateAnalysis = async () => {
    if (!r?.comments?.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeFn({
        data: {
          reportText: r.comments,
          context: {
            goalkeeper: r.goalkeeper,
            team: r.team ?? "",
            opponent: r.opponent ?? "",
            competition: r.competition ?? "",
            matchDate: r.match_date ?? "",
          },
        },
      });
      if (!result.ok) {
        setAnalysisError(result.error);
        return;
      }
      setAnalysis(result.analysis);
    } catch (analysisFailure) {
      setAnalysisError(
        analysisFailure instanceof Error
          ? analysisFailure.message
          : "Could not generate structured analysis.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const copyAnalysis = () => {
    if (!analysis) return;
    const text = [
      `Summary:\n${analysis.summary}`,
      `Key Moments:\n${analysis.keyMoments.join("\n")}`,
      `Development Focus:\n${analysis.developmentFocus.join("\n")}`,
    ].join("\n\n");
    void navigator.clipboard?.writeText(text);
    toast.success("Structured analysis copied");
  };

  if (isLoading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Loading report…</Card>;
  }
  if (error) {
    return <Card className="p-10 text-center text-sm text-destructive">{(error as Error).message}</Card>;
  }
  if (!r) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Report not found.</Card>;
  }

  return (
    <div className="space-y-5">
      <Link to="/reports" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3" />Back to reports
      </Link>

      <PageHeader
        title={`Match Report — ${r.goalkeeper}`}
        description={`${formatDate(r.match_date)} · ${r.team ?? "—"} vs ${r.opponent ?? "—"} · Coach: ${r.coach}`}
        action={
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Average</div>
            <div className="text-3xl font-semibold tabular-nums font-mono">
              {r.average != null ? r.average.toFixed(1) : "—"}
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground uppercase tracking-wider">Competition</span>
        <Pill tone="muted">{r.competition ?? "Not recorded"}</Pill>
      </div>


      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Comments</div>
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {r.comments || <span className="text-muted-foreground italic">No comments recorded.</span>}
          </p>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">RPM Pillar Scores</div>
          <ul className="space-y-1.5 text-sm">
            {PILLAR_IDS.map((id) => (
              <li key={id} className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground text-xs leading-tight">{PILLAR_LABELS[id]}</span>
                <span className="font-semibold tabular-nums font-mono shrink-0">
                  {r.scores[id] != null ? `${r.scores[id]}/5` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {user?.actualRole === "super_admin" && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Super Admin · Structured Analysis
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Optional private analysis. Generating or editing this does not change the mentor's report or the Google Sheet.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {analysis && (
                <button
                  type="button"
                  onClick={copyAnalysis}
                  className="h-8 px-3 rounded-md border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-accent"
                >
                  <Copy className="size-3.5" />Copy
                </button>
              )}
              <button
                type="button"
                disabled={analyzing || (r.comments?.trim().length ?? 0) < 40}
                onClick={() => void generateAnalysis()}
                className="h-8 px-3 rounded-md border border-primary/40 text-primary text-xs font-medium inline-flex items-center gap-1.5 hover:bg-primary/10 disabled:opacity-40"
              >
                {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {analysis ? "Regenerate analysis" : "Generate structured analysis"}
              </button>
            </div>
          </div>

          {analysisError && (
            <div className="text-xs text-destructive" role="alert">{analysisError}</div>
          )}

          {analysis && (
            <div className="grid md:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Summary</span>
                <textarea
                  value={analysis.summary}
                  onChange={(event) => setAnalysis((current) => current ? { ...current, summary: event.target.value } : current)}
                  rows={7}
                  className="w-full px-3 py-2 rounded-md bg-input/60 border border-border text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Key Moments</span>
                <textarea
                  value={analysis.keyMoments.join("\n")}
                  onChange={(event) => setAnalysis((current) => current ? {
                    ...current,
                    keyMoments: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                  } : current)}
                  rows={7}
                  className="w-full px-3 py-2 rounded-md bg-input/60 border border-border text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Development Focus</span>
                <textarea
                  value={analysis.developmentFocus.join("\n")}
                  onChange={(event) => setAnalysis((current) => current ? {
                    ...current,
                    developmentFocus: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                  } : current)}
                  rows={7}
                  className="w-full px-3 py-2 rounded-md bg-input/60 border border-border text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y"
                />
              </label>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Attached Media</div>
          <span className="text-xs text-muted-foreground">{attachments.length} attached</span>
        </div>
        {loadingAttachments ? (
          <div className="text-sm text-muted-foreground py-4">Loading…</div>
        ) : attachments.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No media attached to this report.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {attachments.map((a) => {
              const Icon = ICON[a.media_type] ?? FileText;
              return (
                <button key={a.id} onClick={() => openAsset(a, user)} className="text-left">
                  <Card className="overflow-hidden hover:border-primary/40 transition-colors">
                    <div className="aspect-video bg-gradient-to-br from-accent/40 to-muted grid place-items-center relative">
                      <Icon className="size-8 text-muted-foreground" />
                      <ExternalLink className="size-3.5 absolute top-1.5 right-1.5 text-muted-foreground" />
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-medium line-clamp-1">{a.title}</div>
                      <div className="flex items-center justify-between mt-1">
                        <Pill>{a.media_type}</Pill>
                        <span className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
