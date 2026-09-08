/**
 * Follow-ups: every write-up a scheduled event has asked for, and where it stands.
 *
 * This is the surface that stops a missing Match Report or Interaction going
 * unnoticed. A mentor sees their own; a mentor manager, admin or super admin sees
 * everyone's, scoped by the server rather than by anything chosen here.
 *
 * Statuses are computed from the records themselves on every load, so what is
 * shown here is what the database can prove — not a cached flag.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, SectionTitle } from "@/components/primitives";
import { withPermission } from "@/components/require-permission";
import {
  FOLLOW_UP_STATUS_LABEL,
  OPEN_FOLLOW_UP_STATUSES,
  followUpRequirementLabel,
  type FollowUpStatus,
} from "@/lib/events/follow-up";
import { listEventFollowUps, type EventFollowUpRow } from "@/lib/events/follow-up.functions";
import { syncOverdueFollowUpNotifications } from "@/lib/events/notifications.functions";
import { eventFollowUpsQueryKey, notificationsQueryKey } from "@/lib/events/query-keys";
import {
  FollowUpActionLink,
  FollowUpStatusPill,
  followUpDetail,
} from "@/components/events/follow-up-status";
import { formatDateOnly } from "@/lib/interactions/schema";
import { useAuth } from "@/lib/auth";
import { updateMatchParticipation } from "@/lib/calendar.functions";
import { MatchParticipationControl } from "@/components/events/match-participation-control";
import type { MatchParticipationStatus } from "@/lib/events/participation";
import { isFollowUpListItem } from "@/lib/events/follow-up-list";

export const Route = createFileRoute("/follow-ups")({
  component: withPermission(FollowUpsPage, "calendar.view"),
});

type Filter = "open" | FollowUpStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Needs action" },
  { value: "overdue", label: FOLLOW_UP_STATUS_LABEL.overdue },
  { value: "confirmation_needed", label: FOLLOW_UP_STATUS_LABEL.confirmation_needed },
  { value: "pending", label: FOLLOW_UP_STATUS_LABEL.pending },
  { value: "scheduled", label: FOLLOW_UP_STATUS_LABEL.scheduled },
  { value: "completed", label: FOLLOW_UP_STATUS_LABEL.completed },
  { value: "not_required", label: FOLLOW_UP_STATUS_LABEL.not_required },
  { value: "cancelled", label: FOLLOW_UP_STATUS_LABEL.cancelled },
  { value: "all", label: "Everything" },
];

function matchesFilter(row: EventFollowUpRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return OPEN_FOLLOW_UP_STATUSES.includes(row.followUp.status);
  return row.followUp.status === filter;
}

function FollowUpsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchFollowUps = useServerFn(listEventFollowUps);
  const syncOverdue = useServerFn(syncOverdueFollowUpNotifications);
  const setMatchParticipation = useServerFn(updateMatchParticipation);
  const [filter, setFilter] = useState<Filter>("open");
  const [mineOnly, setMineOnly] = useState(false);
  const [participationSaving, setParticipationSaving] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: eventFollowUpsQueryKey,
    queryFn: () => fetchFollowUps(),
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];

  // Anything already past its deadline becomes an inbox alert for the mentor
  // responsible. Repeating this is harmless: the database keeps one alert per
  // mentor per event, so opening this page twice does not nag twice.
  useEffect(() => {
    if (!data) return;
    const hasOverdue = data.rows.some((r) => r.followUp.status === "overdue");
    if (!hasOverdue) return;
    void syncOverdue({ data: undefined })
      .then((res) => {
        if (res.created > 0) {
          void queryClient.invalidateQueries({
            queryKey: notificationsQueryKey(user?.id ?? "anonymous"),
          });
        }
      })
      .catch(() => {
        // A failed alert must not break the page: the list below is the
        // authoritative view of outstanding work either way.
      });
  }, [data, syncOverdue, queryClient, user?.id]);

  const visible = useMemo(() => {
    const canManage = Boolean(data?.canManage);
    const filtered = rows
      .filter((row) => isFollowUpListItem(row, canManage))
      .filter((r) => (mineOnly ? r.mine : true))
      .filter((r) => matchesFilter(r, filter));
    // Most urgent first: overdue, then the soonest deadline.
    const rank: Record<FollowUpStatus, number> = {
      overdue: 0,
      confirmation_needed: 1,
      pending: 2,
      scheduled: 3,
      completed: 4,
      not_required: 5,
      cancelled: 6,
    };
    return filtered.sort((a, b) => {
      const byStatus = rank[a.followUp.status] - rank[b.followUp.status];
      if (byStatus !== 0) return byStatus;
      return a.followUp.deadlineMs - b.followUp.deadlineMs;
    });
  }, [rows, filter, mineOnly, data?.canManage]);

  const counts = useMemo(() => {
    const canManage = Boolean(data?.canManage);
    const scope = rows.filter(
      (row) => isFollowUpListItem(row, canManage) && (mineOnly ? row.mine : true),
    );
    return {
      overdue: scope.filter((r) => r.followUp.status === "overdue").length,
      confirmationNeeded: scope.filter((r) => r.followUp.status === "confirmation_needed").length,
      pending: scope.filter((r) => r.followUp.status === "pending").length,
      scheduled: scope.filter((r) => r.followUp.status === "scheduled").length,
    };
  }, [rows, mineOnly, data?.canManage]);

  async function handleParticipation(eventId: string, status: MatchParticipationStatus) {
    setParticipationSaving(eventId);
    try {
      await setMatchParticipation({ data: { id: eventId, participation_status: status } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventFollowUpsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
        queryClient.invalidateQueries({
          queryKey: notificationsQueryKey(user?.id ?? "anonymous"),
        }),
      ]);
      toast.success("Match participation updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update participation.");
    } finally {
      setParticipationSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Follow-ups"
        description={
          data?.canSeeEveryone
            ? "Every write-up owed after a scheduled event, across all mentors."
            : "The write-ups you owe after your scheduled events."
        }
        action={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      {counts.overdue > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <div className="font-medium text-destructive">
              {counts.overdue} write-up{counts.overdue === 1 ? "" : "s"} past the 48-hour deadline
            </div>
            <div className="text-xs text-muted-foreground">
              This is an operational duty-of-care alert. It is not a safeguarding concern in itself —
              use the existing escalation route if a completed write-up raises one.
            </div>
          </div>
        </div>
      )}

      {counts.confirmationNeeded > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2.5 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">
              Confirm who played in {counts.confirmationNeeded} Match event
              {counts.confirmationNeeded === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-muted-foreground">
              These are not overdue Match Reports. Confirm participation first; only Played creates
              a report requirement.
            </div>
          </div>
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {FILTERS.filter((f) => data?.canManage || f.value !== "confirmation_needed").map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                filter === f.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/40"
              }`}
            >
              {f.label}
            </button>
          ))}
          {data?.canSeeEveryone && (
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)}
                className="size-3.5"
              />
              Only mine
            </label>
          )}
        </div>

        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            Overdue <strong className="text-destructive">{counts.overdue}</strong>
          </span>
          {data?.canManage && (
            <span>
              Confirm participation <strong className="text-warning">{counts.confirmationNeeded}</strong>
            </span>
          )}
          <span>
            Pending <strong className="text-warning">{counts.pending}</strong>
          </span>
          <span>
            Scheduled <strong className="text-foreground">{counts.scheduled}</strong>
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading follow-ups…</div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load follow-ups."}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing here.{" "}
            <Link to="/calendar" className="text-primary hover:underline">
              Open the calendar
            </Link>{" "}
            to schedule an event.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((row) => (
              <div
                key={row.eventId}
                className="rounded-md border border-border px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FollowUpStatusPill status={row.followUp.status} />
                      <span className="font-medium">{row.goalkeeperName || "Unnamed goalkeeper"}</span>
                      <span className="text-xs text-muted-foreground">{row.eventType}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDateOnly(row.eventDate)}
                      {row.startTime ? ` · ${row.startTime.slice(0, 5)}` : ""} ·{" "}
                      {row.assignedMentorName || "Unassigned"}
                      {row.mine && " (you)"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {followUpDetail(row.followUp, row.waiverReason, row.cancellationReason)}
                    </div>
                    {data?.canManage && row.eventType === "Match" && (
                      <div className="mt-2">
                        <MatchParticipationControl
                          status={row.participationStatus}
                          disabled={participationSaving === row.eventId}
                          label={`Participation — ${row.goalkeeperName || "goalkeeper"}`}
                          onChange={(status) => handleParticipation(row.eventId, status)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <FollowUpActionLink
                      event={{
                        id: row.eventId,
                        title: row.title,
                        eventType: row.eventType,
                        eventDate: row.eventDate,
                        startTime: row.startTime,
                        endTime: row.endTime,
                        goalkeeperName: row.goalkeeperName,
                        playerId: row.playerId,
                      }}
                      followUp={row.followUp}
                      label={`Submit ${followUpRequirementLabel(row.followUp.kind)}`}
                      canConfirmParticipation={Boolean(data?.canManage)}
                    />
                    <Link to="/calendar" className="text-[11px] text-muted-foreground hover:underline">
                      View in calendar
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>How these statuses work</SectionTitle>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            <strong className="text-foreground">Scheduled</strong> — the event has not happened yet.
          </li>
          <li>
            <strong className="text-foreground">Confirm participation</strong> — the Match happened,
            but nobody has confirmed whether this goalkeeper played; no report is overdue yet.
          </li>
          <li>
            <strong className="text-foreground">Pending</strong> — it has happened and the 48-hour
            window is still open.
          </li>
          <li>
            <strong className="text-foreground">Completed</strong> — the linked Match Report or
            Interaction has been saved and can be read back.
          </li>
          <li>
            <strong className="text-foreground">Overdue</strong> — the 48 hours passed with nothing
            saved.
          </li>
          <li>
            <strong className="text-foreground">Cancelled</strong> — the event was called off, so
            nothing is owed.
          </li>
          <li>
            <strong className="text-foreground">Not required</strong> — a manager waived it and
            recorded why, or the goalkeeper was confirmed as Did not play.
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          A Match is completed by its Match Report. A Training Ground Visit or Coffee Catch-up is
          completed by its Interaction. Deadlines are counted in London time.
        </p>
      </Card>
    </div>
  );
}
