import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getMatchReport } from "@/lib/match-reports/reports.functions";
import { PILLAR_IDS, PILLAR_LABELS } from "@/lib/match-reports/schema";
import { ExternalLink } from "lucide-react";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface Props {
  reportId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportPreviewModal({ reportId, open, onOpenChange }: Props) {
  const getFn = useServerFn(getMatchReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["match-report", reportId],
    queryFn: () => getFn({ data: { reportId: reportId! } }),
    enabled: !!reportId && open,
  });

  const r = data?.report ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{r ? `Match Report — ${r.goalkeeper}` : "Match Report Preview"}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading report…</div>
        )}
        {error && (
          <div className="py-8 text-center text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {r && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="text-xs text-muted-foreground leading-relaxed">
                <div>
                  {formatDate(r.match_date)} · {r.team ?? "—"} vs {r.opponent ?? "—"}
                </div>
                <div>
                  Coach: {r.coach}
                  {r.competition ? ` · ${r.competition}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Average
                </div>
                <div className="text-2xl font-semibold tabular-nums font-mono">
                  {r.average != null ? r.average.toFixed(1) : "—"}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                RPM Pillar Scores
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {PILLAR_IDS.map((id) => (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-3 border-b border-border/40 py-1"
                  >
                    <span className="text-muted-foreground text-xs">{PILLAR_LABELS[id]}</span>
                    <span className="font-semibold tabular-nums font-mono text-xs">
                      {r.scores[id] != null ? `${r.scores[id]}/5` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                Comments
              </div>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {r.comments || (
                  <span className="text-muted-foreground italic">No comments recorded.</span>
                )}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {r && (
            <Link
              to="/reports/$reportId"
              params={{ reportId: r.report_id }}
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              View full report <ExternalLink className="size-3.5" />
            </Link>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
