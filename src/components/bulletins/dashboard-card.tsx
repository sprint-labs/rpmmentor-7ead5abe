import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, AlertTriangle, CalendarClock, Columns3 } from "lucide-react";
import { Card, SectionTitle } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { getBulletinSummary } from "@/lib/bulletins.functions";

const BOARD_LABELS = {
  daily_update: "Daily updates",
  deal: "Deals",
  lead: "Leads",
  mandate: "Mandates",
} as const;

interface BulletinDashboardCardProps {
  scope: "mine" | "team";
}

/**
 * A small, durable entry point into the operational workspace.
 *
 * Management roles see team counts here. Mentors see only counts for work
 * currently assigned to them; the server and RLS independently enforce scope.
 */
export function BulletinDashboardCard({ scope }: BulletinDashboardCardProps) {
  const { user } = useAuth();
  const fetchSummary = useServerFn(getBulletinSummary);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["bulletins", user?.id ?? "anonymous", scope, "summary"],
    queryFn: () => fetchSummary({ data: { scope } }),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: 1,
  });

  const total = data?.boards.reduce((sum, board) => sum + board.total, 0) ?? 0;

  return (
    <Card className="overflow-hidden p-4 sm:p-5" data-testid="bulletin-dashboard-card">
      <SectionTitle
        action={
          <Link
            to="/bulletins"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open board
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Columns3 className="size-4 text-primary" aria-hidden="true" />
          {scope === "team" ? "Team Bulletin Board" : "My Bulletin Board"}
        </span>
      </SectionTitle>

      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading Bulletin Board…
        </p>
      ) : isError || !data ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-muted-foreground">Bulletin counts are unavailable.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-11 rounded-md px-3 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Retry
          </button>
        </div>
      ) : total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {scope === "team"
            ? "No Bulletin Board work yet. Open the board to add the first item."
            : "No Bulletin Board work is assigned to you."}
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.boards.map((board) => (
              <div
                key={board.kind}
                className="rounded-md border border-border/70 bg-background/40 p-3"
              >
                <div className="font-mono text-2xl font-bold tabular-nums text-foreground">
                  {board.total}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {BOARD_LABELS[board.kind]}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {data.attention.overdue} overdue
            </span>
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 text-warning">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {data.attention.dueSoon} due in 7 days
            </span>
            {scope === "team" && (
              <span className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-muted-foreground">
                {data.attention.unassigned} unassigned
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
