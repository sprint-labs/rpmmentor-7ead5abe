import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Avatar, Card, Pill } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  BULLETIN_BOARD_META,
  bulletinOwnerLabel,
  boardSingular,
  formatBulletinDate,
  formatBulletinDateTime,
} from "@/components/bulletins/bulletin-display";
import { cn } from "@/lib/utils";
import type {
  BulletinDetail,
  BulletinItem,
  BulletinKind,
  BulletinStatus,
  BulletinSummary,
} from "@/lib/bulletins/schema";

const STATUS_LABELS: Record<BulletinStatus, string> = {
  open: "Open",
  working: "Working",
  blocked: "Blocked",
  closed: "Closed",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function statusTone(status: BulletinStatus): "muted" | "info" | "warning" | "success" {
  if (status === "blocked") return "warning";
  if (status === "working") return "info";
  if (status === "closed") return "success";
  return "muted";
}

function summaryFor(summary: BulletinSummary | undefined, kind: BulletinKind) {
  return summary?.boards.find((board) => board.kind === kind);
}

export function BulletinAttentionStrip({
  summary,
  loading = false,
}: {
  summary?: BulletinSummary;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div
        className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3"
        aria-label="Loading bulletin attention summary"
      >
        {[0, 1, 2].map((key) => (
          <div key={key} className="bg-card p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-10" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const cells = [
    {
      label: "Overdue",
      value: summary.attention.overdue,
      className: summary.attention.overdue > 0 ? "text-destructive" : "text-muted-foreground",
    },
    {
      label: "Due soon",
      value: summary.attention.dueSoon,
      className: summary.attention.dueSoon > 0 ? "text-warning" : "text-muted-foreground",
    },
    ...(summary.canManage
      ? [
          {
            label: "Unassigned",
            value: summary.attention.unassigned,
            className: summary.attention.unassigned > 0 ? "text-info" : "text-muted-foreground",
          },
        ]
      : []),
  ];
  const clear = cells.every((cell) => cell.value === 0);

  return (
    <section
      aria-labelledby="bulletin-attention-heading"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {clear ? (
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-4 text-warning" aria-hidden="true" />
          )}
          <h2
            id="bulletin-attention-heading"
            className="text-xs font-bold uppercase tracking-[0.12em]"
          >
            {clear ? "Nothing urgent" : "Needs attention"}
          </h2>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          As at {formatBulletinDate(summary.asOfDate)}
        </span>
      </div>
      <div
        className={cn(
          "grid gap-px bg-border",
          summary.canManage ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        {cells.map((cell) => (
          <div key={cell.label} className="bg-card px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {cell.label}
            </div>
            <div
              className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", cell.className)}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BulletinBoardSelector({
  current,
  summary,
  onChange,
}: {
  current: BulletinKind;
  summary?: BulletinSummary;
  onChange: (kind: BulletinKind) => void;
}) {
  return (
    <nav aria-label="Bulletin boards" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {BULLETIN_BOARD_META.map((board) => {
        const Icon = board.icon;
        const count = summaryFor(summary, board.kind);
        const selected = current === board.kind;
        return (
          <button
            key={board.kind}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(board.kind)}
            className={cn(
              "group min-h-20 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]"
                : "border-border bg-card hover:border-primary/50 hover:bg-accent/25",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-md border",
                    selected
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{board.label}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {board.kind === "deal" ? "Club needs" : "Operational board"}
                  </span>
                </span>
              </span>
              <span
                className="font-mono text-lg font-semibold tabular-nums"
                aria-label={count ? `${count.total} items` : "Item count unavailable"}
              >
                {count?.total ?? "—"}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

interface BulletinWorkspaceProps {
  kind: BulletinKind;
  canManage: boolean;
  rows: BulletinItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  selectedId: string | null;
  detail?: BulletinDetail;
  search: string;
  status: "all" | BulletinStatus;
  listLoading?: boolean;
  listFetching?: boolean;
  listError?: string | null;
  detailLoading?: boolean;
  detailError?: string | null;
  addingUpdate?: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: "all" | BulletinStatus) => void;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
  onRetryList: () => void;
  onRetryDetail: () => void;
  onEdit: (item: BulletinItem) => void;
  onAddUpdate: (body: string) => Promise<void>;
  onUpdatesPageChange: (page: number) => void;
}

export function BulletinWorkspace({
  kind,
  canManage,
  rows,
  total,
  page,
  pageSize,
  pageCount,
  selectedId,
  detail,
  search,
  status,
  listLoading = false,
  listFetching = false,
  listError = null,
  detailLoading = false,
  detailError = null,
  addingUpdate = false,
  onSearchChange,
  onStatusChange,
  onSelect,
  onPageChange,
  onRetryList,
  onRetryDetail,
  onEdit,
  onAddUpdate,
  onUpdatesPageChange,
}: BulletinWorkspaceProps) {
  const board = BULLETIN_BOARD_META.find((candidate) => candidate.kind === kind)!;
  const detailRef = useRef<HTMLElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingDetailFocusRef = useRef<string | null>(null);

  const selectItem = (id: string) => {
    const mobile =
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023px)").matches;
    if (mobile) pendingDetailFocusRef.current = id;
    onSelect(id);
    if (mobile && !detailLoading && detail?.item.id === id) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        detailHeadingRef.current?.focus({ preventScroll: true });
        pendingDetailFocusRef.current = null;
      });
    }
  };

  useEffect(() => {
    const pendingId = pendingDetailFocusRef.current;
    if (!pendingId || detailLoading || detail?.item.id !== pendingId) return;
    const frame = window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detailHeadingRef.current?.focus({ preventScroll: true });
      pendingDetailFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detail?.item.id, detailLoading]);

  const hasFilters = Boolean(search.trim()) || status !== "all";
  const first = total === 0 || rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = first === 0 ? 0 : Math.min(total, first + rows.length - 1);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">{board.label}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{board.description}</p>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[minmax(19rem,0.78fr)_minmax(0,1.22fr)]">
        <section
          aria-label={`${board.label} list`}
          className="min-w-0 border-b border-border lg:border-b-0 lg:border-r"
        >
          <div className="grid gap-2 border-b border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_9rem]">
            <label className="relative">
              <span className="sr-only">Search {board.label}</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search title, subject or next action"
                maxLength={120}
                className="min-h-11 pl-9 sm:min-h-9"
              />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={status}
                onChange={(event) => onStatusChange(event.target.value as "all" | BulletinStatus)}
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
              >
                <option value="all">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="relative lg:max-h-[min(64vh,48rem)] lg:min-h-[28rem] lg:overflow-y-auto">
            {listFetching && !listLoading ? (
              <div
                className="absolute right-3 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-border bg-background/95 px-2 py-1 text-[10px] text-muted-foreground shadow-sm"
                role="status"
              >
                <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Updating
              </div>
            ) : null}

            {listLoading ? (
              <BulletinListSkeleton />
            ) : listError ? (
              <StatePanel
                icon={AlertCircle}
                title="Could not load this board"
                description={listError}
                actionLabel="Try again"
                onAction={onRetryList}
                tone="destructive"
              />
            ) : rows.length === 0 ? (
              <StatePanel
                icon={Inbox}
                title={
                  hasFilters
                    ? "No matching items"
                    : canManage
                      ? `No ${board.label.toLocaleLowerCase("en-GB")} yet`
                      : `No ${board.label.toLocaleLowerCase("en-GB")} assigned to you`
                }
                description={
                  hasFilters
                    ? "Try a broader search or a different status."
                    : canManage
                      ? `Create the first ${board.singular.toLocaleLowerCase("en-GB")} when there is real work to record.`
                      : "Nothing is currently assigned to you on this board."
                }
              />
            ) : (
              <div className="divide-y divide-border/70">
                {rows.map((item) => (
                  <BulletinListItem
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    onSelect={() => selectItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {!listLoading && !listError && total > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
              <span className="text-[11px] text-muted-foreground" aria-live="polite">
                {first}–{last} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-9"
                  disabled={page <= 1 || listFetching}
                  onClick={() => onPageChange(page - 1)}
                  aria-label="Previous page"
                >
                  <ArrowLeft aria-hidden="true" />
                </Button>
                <span className="min-w-16 text-center font-mono text-[11px] text-muted-foreground">
                  {page} / {Math.max(pageCount, 1)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-9"
                  disabled={page >= pageCount || listFetching}
                  onClick={() => onPageChange(page + 1)}
                  aria-label="Next page"
                >
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section
          ref={detailRef}
          id="bulletin-detail"
          aria-label="Selected bulletin details"
          className="min-w-0 scroll-mt-4 bg-background/30"
        >
          {detailLoading ? (
            <BulletinDetailSkeleton />
          ) : detailError ? (
            <StatePanel
              icon={AlertCircle}
              title="Could not load this item"
              description={detailError}
              actionLabel="Try again"
              onAction={onRetryDetail}
              tone="destructive"
            />
          ) : detail ? (
            <BulletinDetailPanel
              detail={detail}
              headingRef={detailHeadingRef}
              addingUpdate={addingUpdate}
              onEdit={onEdit}
              onAddUpdate={onAddUpdate}
              onUpdatesPageChange={onUpdatesPageChange}
            />
          ) : (
            <StatePanel
              icon={Inbox}
              title="Choose an item"
              description="Select an item from the list to see its owner, next action and update history."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function BulletinListItem({
  item,
  selected,
  onSelect,
}: {
  item: BulletinItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const ownerLabel = bulletinOwnerLabel(item);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls="bulletin-detail"
      onClick={onSelect}
      className={cn(
        "grid min-h-24 w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-accent/25",
      )}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Pill>
          <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.subjectType}
          </span>
        </span>
        <span className="mt-1.5 block truncate text-sm font-semibold">{item.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {item.subjectName}
        </span>
        <span className="mt-2 block truncate text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Next:</span>{" "}
          {item.nextAction || "Not recorded"}
        </span>
      </span>
      <span className="flex min-w-20 flex-col items-end justify-between text-right">
        <span className="text-[10px] text-muted-foreground">
          {formatBulletinDate(item.dueDate)}
        </span>
        <span className="mt-2 inline-flex max-w-28 items-center gap-1.5">
          <Avatar initials={initials(ownerLabel)} size={22} alt={ownerLabel} />
          <span className="truncate text-[10px] font-medium">{ownerLabel}</span>
        </span>
      </span>
    </button>
  );
}

function DetailFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border/70 pb-3 last:border-b-0">
      <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words whitespace-pre-wrap text-sm">{children}</dd>
    </div>
  );
}

function BulletinDetailPanel({
  detail,
  headingRef,
  addingUpdate,
  onEdit,
  onAddUpdate,
  onUpdatesPageChange,
}: {
  detail: BulletinDetail;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  addingUpdate: boolean;
  onEdit: (item: BulletinItem) => void;
  onAddUpdate: (body: string) => Promise<void>;
  onUpdatesPageChange: (page: number) => void;
}) {
  const { item, updates, canManage } = detail;
  const ownerLabel = bulletinOwnerLabel(item);
  const [body, setBody] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setBody("");
    setSubmitError(null);
  }, [item.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || addingUpdate) return;
    setSubmitError(null);
    try {
      await onAddUpdate(trimmed);
      setBody("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not add the update.");
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="info">{boardSingular(item.kind)}</Pill>
          <Pill tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Pill>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold leading-tight focus:outline-none"
            >
              {item.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.subjectName}</p>
          </div>
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10"
              onClick={() => onEdit(item)}
            >
              <Pencil aria-hidden="true" /> Edit & assign
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4 sm:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em]">Brief</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {item.details || "No brief recorded."}
          </p>
        </Card>
        <Card className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em]">Ownership</h3>
          <dl className="mt-3 space-y-3">
            <DetailFact label="Owner">{ownerLabel}</DetailFact>
            {!item.ownerId && item.ownerName ? (
              <DetailFact label="Former owner">{item.ownerName}</DetailFact>
            ) : null}
            <DetailFact label="Due">{formatBulletinDate(item.dueDate)}</DetailFact>
            <DetailFact label="Next action">{item.nextAction || "Not recorded"}</DetailFact>
          </dl>
        </Card>
        <Card className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em]">Record</h3>
          <dl className="mt-3 space-y-3">
            <DetailFact label="Subject type">{item.subjectType}</DetailFact>
            <DetailFact label="Created by">{item.createdByName || "Former team member"}</DetailFact>
            <DetailFact label="Last changed">{formatBulletinDateTime(item.updatedAt)}</DetailFact>
          </dl>
        </Card>
      </div>

      <section aria-labelledby="bulletin-timeline-heading">
        <div className="flex items-center justify-between gap-3">
          <h3
            id="bulletin-timeline-heading"
            className="text-xs font-bold uppercase tracking-[0.12em]"
          >
            Update timeline
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {detail.updatesTotal} total
          </span>
        </div>
        {updates.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-border px-3 py-7 text-center text-sm text-muted-foreground">
            No updates have been added yet.
          </div>
        ) : (
          <ol className="mt-3 space-y-3">
            {updates.map((update) => (
              <li
                key={update.id}
                className="relative border-l border-border pl-4 before:absolute before:-left-1 before:top-1 before:size-2 before:rounded-full before:bg-primary"
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{update.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {update.authorName || "Former team member"} ·{" "}
                  {formatBulletinDateTime(update.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
        {detail.updatesPageCount > 1 ? (
          <nav
            aria-label="Update timeline pages"
            className="mt-3 flex items-center justify-end gap-2"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={detail.updatesPage <= 1}
              onClick={() => onUpdatesPageChange(detail.updatesPage - 1)}
            >
              <ArrowLeft aria-hidden="true" /> Previous
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">
              {detail.updatesPage} / {detail.updatesPageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={detail.updatesPage >= detail.updatesPageCount}
              onClick={() => onUpdatesPageChange(detail.updatesPage + 1)}
            >
              Next <ArrowRight aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
      </section>

      <form onSubmit={submit} className="space-y-2 rounded-md border border-border bg-card p-3">
        <label htmlFor={`bulletin-update-${item.id}`} className="text-xs font-semibold">
          Add an update
        </label>
        <Textarea
          id={`bulletin-update-${item.id}`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          maxLength={4000}
          disabled={addingUpdate}
          placeholder="What changed, what has been done, and what happens next?"
          className="min-h-28"
        />
        {submitError ? (
          <p role="alert" className="text-xs text-destructive">
            {submitError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" className="min-h-11" disabled={addingUpdate || !body.trim()}>
            {addingUpdate ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <MessageSquarePlus aria-hidden="true" />
            )}
            Add update
          </Button>
        </div>
      </form>
    </div>
  );
}

function StatePanel({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = "muted",
}: {
  icon: typeof Inbox;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "muted" | "destructive";
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
      <span
        className={cn(
          "grid size-10 place-items-center rounded-full border",
          tone === "destructive"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <h3
        className={cn("mt-3 text-sm font-semibold", tone === "destructive" && "text-destructive")}
      >
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 min-h-10"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function BulletinListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading bulletin items" className="divide-y divide-border/70">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-4 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function BulletinDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading bulletin details" className="space-y-4 p-5">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-6 h-32 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    </div>
  );
}
