import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Card, Pill } from "@/components/primitives";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Video, Image as ImageIcon, Mic, ExternalLink } from "lucide-react";
import { listReportAttachments, openAsset, type MediaAsset } from "@/lib/media-store";
import { useAuth } from "@/lib/auth";
import { getMatchReport } from "@/lib/match-reports/reports.functions";
import { PILLAR_IDS, PILLAR_LABELS } from "@/lib/match-reports/schema";

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

  const { data, isLoading, error } = useQuery({
    queryKey: ["match-report", reportId],
    queryFn: () => getFn({ data: { reportId } }),
  });

  const r = data?.report ?? null;

  const [attachments, setAttachments] = useState<MediaAsset[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);

  const loadAttachments = useCallback(async () => {
    setLoadingAttachments(true);
    try { setAttachments(await listReportAttachments(reportId)); }
    catch (e) { console.error(e); }
    finally { setLoadingAttachments(false); }
  }, [reportId]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

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
