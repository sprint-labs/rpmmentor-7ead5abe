import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, AlertTriangle, CalendarClock, Columns3 } from "lucide-react";
import { Card, SectionTitle } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { getBulletinSummary } from "@/lib/bulletins.functions";
import type { BulletinAttention, BulletinKind } from "@/lib/bulletins/schema";

const BOARD_LABELS = {
  daily_update: "Daily updates",
  deal: "Deals",
  lead: "Leads",
  mandate: "Mandates",
} as const;

/**
 * What a board's number says at a glance.
 *
 * Daily updates are the pulse of the board rather than a workload, so they
 * take the information blue and keep it whether or not anyone has posted.
 * The other three are work: a zero is nothing to do and reads as muted, a
 * positive number is something waiting and reads as the brand green.
 *
 * The display grade is deliberate: these are 24px bold numerals, which WCAG
 * counts as large text, and the display tokens are proved against that 3:1
 * floor by the contrast test.
 */
function countTone(kind: BulletinKind, total: number): string {
  if (kind === "daily_update") return "text-info-display";
  return total > 0 ? "text-primary-display" : "text-muted-foreground";
}

const ATTENTION_TONES = {
  /** Reads as the roster's Unassigned badge: this is the one that is wrong. */
  destructive: "border-destructive/40 text-destructive",
  /** Reads as Tier 3: worth watching, not yet a problem. */
  warning: "border-warning/40 text-warning",
  /** Reads as Tier 4: a fact, not a flag. */
  muted: "border-border text-muted-foreground",
} as const;

/**
 * An attention count, set as a tier badge and linked to the work it counts.
 *
 * The badge takes TierBadge's shape and palette so the dashboard and the
 * roster describe severity the same way. A zero drops to the muted tone
 * whatever its own severity: nothing outstanding should be coloured as though
 * something were.
 */
function AttentionBadge({
  attention,
  count,
  label,
  tone,
  Icon,
}: {
  attention: BulletinAttention;
  count: number;
  label: string;
  tone: keyof typeof ATTENTION_TONES;
  Icon?: typeof AlertTriangle;
}) {
  const resolved = count > 0 ? ATTENTION_TONES[tone] : ATTENTION_TONES.muted;
  return (
    <Link
      to="/bulletins"
      search={{ board: "daily_update", q: "", status: "all", page: 1, item: "", attention }}
      aria-label={`Show ${count} ${label}`}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${resolved}`}
    >
      {Icon && count > 0 ? <Icon className="size-3" aria-hidden="true" /> : null}
      {count} {label}
    </Link>
  );
}

interface BulletinDashboardCardProps {
  scope: "mine" | "team";
}

/**
 * A small, durable entry point into the operational workspace.
 *
 * Mentors and managers share the team Bulletin Board counts here.
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary-ink hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open board
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Columns3 className="size-4 text-primary-ink" aria-hidden="true" />
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
            className="min-h-11 rounded-md px-3 text-xs font-semibold uppercase tracking-wider text-primary-ink hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
              <Link
                key={board.kind}
                to="/bulletins"
                search={{
                  board: board.kind,
                  q: "",
                  status: "all",
                  page: 1,
                  item: "",
                  attention: "",
                }}
                aria-label={`Open ${BOARD_LABELS[board.kind]} — ${board.total}`}
                className="group rounded-md border border-border/70 bg-background/40 p-3 transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div
                  className={`font-mono text-2xl font-bold tabular-nums ${countTone(board.kind, board.total)}`}
                >
                  {board.total}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {BOARD_LABELS[board.kind]}
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <AttentionBadge
              attention="overdue"
              count={data.attention.overdue}
              label="overdue"
              tone="destructive"
              Icon={AlertTriangle}
            />
            <AttentionBadge
              attention="due_soon"
              count={data.attention.dueSoon}
              label="due in 7 days"
              tone="warning"
              Icon={CalendarClock}
            />
            {scope === "team" && (
              <AttentionBadge
                attention="unassigned"
                count={data.attention.unassigned}
                label="unassigned"
                tone="muted"
              />
            )}
          </div>
        </>
      )}
    </Card>
  );
}
