/**
 * Help & Messages: own support threads for every signed-in role, plus Super Admin
 * inbox and broadcast controls.
 */
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Megaphone, MessageSquarePlus, Bug } from "lucide-react";
import { PageHeader, Card } from "@/components/primitives";
import { withPermission } from "@/components/require-permission";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  getSupportThread,
  listAllSupportThreads,
  listMySupportThreads,
  replySupportThread,
  setSupportThreadStatus,
} from "@/lib/support.functions";
import {
  SUPPORT_THREAD_KINDS,
  SUPPORT_THREAD_STATUSES,
  SUPPORT_THREAD_STATUS_LABEL,
  type SupportThread,
  type SupportThreadKind,
  type SupportThreadStatus,
} from "@/lib/support/schema";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { BroadcastCentre } from "@/components/broadcast-centre";

const supportSearchSchema = z.object({
  thread: z.string().uuid().optional().or(z.literal("")).catch(""),
  tab: z.enum(["mine", "all", "broadcasts"]).optional().catch("mine"),
});

export const Route = createFileRoute("/support")({
  validateSearch: zodValidator(supportSearchSchema),
  component: withPermission(SupportPage, "support.send"),
});

type TabId = "mine" | "all" | "broadcasts";

function SupportPage() {
  const { can, user } = useAuth();
  const canInbox = can("support.inbox");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/support" });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);

  const tab: TabId =
    search.tab === "all" && canInbox
      ? "all"
      : search.tab === "broadcasts" && canInbox
        ? "broadcasts"
        : "mine";

  const selectedThreadId = search.thread || null;

  function setTab(next: TabId) {
    void navigate({
      search: (prev: { thread?: string; tab?: TabId }) => ({ ...prev, tab: next }),
    });
  }

  function selectThread(threadId: string | null) {
    void navigate({
      search: (prev: { thread?: string; tab?: TabId }) => ({ ...prev, thread: threadId ?? "" }),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help & Messages"
        description="Report a bug, ask a question, or follow replies on your threads."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWorkflow("bug")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
            >
              <Bug className="size-3.5" /> Report a bug
            </button>
            <button
              type="button"
              onClick={() => setWorkflow("question")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <MessageSquarePlus className="size-3.5" /> Ask a question
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: "mine" as const, label: "My messages", show: true },
            { id: "all" as const, label: "All threads", show: canInbox },
            { id: "broadcasts" as const, label: "Broadcasts", show: canInbox },
          ] as const
        )
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                tab === t.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/40",
              )}
            >
              {t.id === "broadcasts" ? (
                <Megaphone className="size-3" />
              ) : (
                <LifeBuoy className="size-3" />
              )}
              {t.label}
            </button>
          ))}
      </div>

      {tab === "mine" && (
        <MyMessagesPanel
          userId={user?.id ?? ""}
          selectedThreadId={selectedThreadId}
          onSelectThread={selectThread}
        />
      )}
      {tab === "all" && canInbox && (
        <AllThreadsPanel selectedThreadId={selectedThreadId} onSelectThread={selectThread} />
      )}
      {tab === "broadcasts" && canInbox && <BroadcastCentre />}

      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} prefillPagePath={path} />
    </div>
  );
}

function MyMessagesPanel({
  userId,
  selectedThreadId,
  onSelectThread,
}: {
  userId: string;
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
}) {
  const listMine = useServerFn(listMySupportThreads);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["support", "mine", userId],
    queryFn: () => listMine(),
    staleTime: 30_000,
  });

  return (
    <ThreadListAndDetail
      threads={data ?? []}
      loading={isLoading}
      error={isError ? (error as Error).message : null}
      selectedThreadId={selectedThreadId}
      onSelectThread={onSelectThread}
      onRefresh={() => void refetch()}
      emptyTitle="No messages yet"
      emptyBody="Report a bug or ask a question to start a thread with Super Admin."
      canManageStatus={false}
    />
  );
}

function AllThreadsPanel({
  selectedThreadId,
  onSelectThread,
}: {
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
}) {
  const listAll = useServerFn(listAllSupportThreads);
  const [kind, setKind] = useState<SupportThreadKind | "all">("all");
  const [status, setStatus] = useState<SupportThreadStatus | "all">("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["support", "all", kind, status],
    queryFn: () =>
      listAll({
        data: {
          kind: kind === "all" ? undefined : kind,
          status: status === "all" ? undefined : status,
          page: 1,
          pageSize: 50,
        },
      }),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SupportThreadKind | "all")}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="all">All kinds</option>
          {SUPPORT_THREAD_KINDS.map((k) => (
            <option key={k} value={k}>
              {k === "bug" ? "Bugs" : "Questions"}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SupportThreadStatus | "all")}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="all">All statuses</option>
          {SUPPORT_THREAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPORT_THREAD_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <ThreadListAndDetail
        threads={data?.rows ?? []}
        loading={isLoading}
        error={isError ? (error as Error).message : null}
        selectedThreadId={selectedThreadId}
        onSelectThread={onSelectThread}
        onRefresh={() => void refetch()}
        emptyTitle="No threads match"
        emptyBody="Try a different kind or status filter."
        canManageStatus
      />
    </div>
  );
}

function ThreadListAndDetail({
  threads,
  loading,
  error,
  selectedThreadId,
  onSelectThread,
  onRefresh,
  emptyTitle,
  emptyBody,
  canManageStatus,
}: {
  threads: SupportThread[];
  loading: boolean;
  error: string | null;
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
  onRefresh: () => void;
  emptyTitle: string;
  emptyBody: string;
  canManageStatus: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-destructive">{error}</div>
        ) : threads.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-sm font-medium">{emptyTitle}</div>
            <div className="mt-1 text-xs text-muted-foreground">{emptyBody}</div>
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-[520px] overflow-y-auto">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                  className={cn(
                    "w-full px-3 py-2.5 text-left hover:bg-accent/40",
                    selectedThreadId === thread.id && "bg-accent/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {thread.kind}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {SUPPORT_THREAD_STATUS_LABEL[thread.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium line-clamp-2">{thread.subject}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(thread.lastMessageAt).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        {selectedThreadId ? (
          <ThreadDetail
            threadId={selectedThreadId}
            canManageStatus={canManageStatus}
            onChanged={onRefresh}
          />
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Select a thread to read and reply.
          </div>
        )}
      </Card>
    </div>
  );
}

function ThreadDetail({
  threadId,
  canManageStatus,
  onChanged,
}: {
  threadId: string;
  canManageStatus: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchThread = useServerFn(getSupportThread);
  const reply = useServerFn(replySupportThread);
  const setStatus = useServerFn(setSupportThreadStatus);
  const [body, setBody] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["support", "thread", threadId],
    queryFn: () => fetchThread({ data: { threadId } }),
    staleTime: 15_000,
  });

  const replyMutation = useMutation({
    mutationFn: () => reply({ data: { threadId, body } }),
    onSuccess: async () => {
      setBody("");
      toast.success("Reply sent");
      await refetch();
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: SupportThreadStatus) => setStatus({ data: { threadId, status } }),
    onSuccess: async () => {
      toast.success("Status updated");
      await refetch();
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading thread…</div>;
  }
  if (isError || !data) {
    return (
      <div className="py-8 text-center text-sm text-destructive">
        {(error as Error | undefined)?.message ?? "Thread unavailable."}
      </div>
    );
  }

  const canReply = data.status !== "resolved" || data.authorId === user?.id;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            {data.kind}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {SUPPORT_THREAD_STATUS_LABEL[data.status]}
          </span>
          {data.kind === "bug" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              Severity: {data.severity}
            </span>
          )}
        </div>
        <h2 className="mt-2 text-base font-semibold">{data.subject}</h2>
        {data.pagePath && (
          <div className="mt-1 text-xs text-muted-foreground">Page: {data.pagePath}</div>
        )}
      </div>

      {canManageStatus && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="thread-status">
            Status
          </label>
          <select
            id="thread-status"
            value={data.status}
            disabled={statusMutation.isPending}
            onChange={(e) => statusMutation.mutate(e.target.value as SupportThreadStatus)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {SUPPORT_THREAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUPPORT_THREAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {data.messages.map((message) => {
          const mine = message.authorId === user?.id;
          return (
            <div
              key={message.id}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                mine ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30",
              )}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {mine ? "You" : "Other party"} · {new Date(message.createdAt).toLocaleString()}
              </div>
              <div className="mt-1 whitespace-pre-wrap">{message.body}</div>
            </div>
          );
        })}
      </div>

      {canReply ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            replyMutation.mutate();
          }}
        >
          <label htmlFor="reply-body" className="text-xs font-medium text-muted-foreground">
            Reply
          </label>
          <textarea
            id="reply-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={4}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder={
              data.status === "resolved"
                ? "Replying will reopen this thread for Super Admin."
                : "Write a reply…"
            }
          />
          <button
            type="submit"
            disabled={replyMutation.isPending || !body.trim()}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {replyMutation.isPending ? "Sending…" : "Send reply"}
          </button>
        </form>
      ) : (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          This thread is resolved. Super Admin can reopen it by changing the status.
        </div>
      )}
    </div>
  );
}
