import { Loader2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BULLETIN_KINDS,
  BULLETIN_STATUSES,
  BULLETIN_SUBJECT_TYPES,
  bulletinDraftInput,
  type BulletinDraft,
  type BulletinItem,
  type BulletinKind,
  type BulletinOwner,
  type BulletinStatus,
  type BulletinSubjectType,
} from "@/lib/bulletins/schema";
import { boardLabel, boardSingular } from "@/components/bulletins/bulletin-display";

const STATUS_LABELS: Record<BulletinStatus, string> = {
  open: "Open",
  working: "Working",
  blocked: "Blocked",
  closed: "Closed",
};

const SUBJECT_LABELS: Record<BulletinSubjectType, string> = {
  club: "Club",
  player: "Player",
  other: "Other",
};

function blankDraft(kind: BulletinKind): BulletinDraft {
  return {
    kind,
    title: "",
    details: "",
    subjectType: kind === "deal" || kind === "mandate" ? "club" : "other",
    subjectName: "",
    status: "open",
    ownerId: null,
    nextAction: "",
    dueDate: null,
  };
}

function draftFromItem(item: BulletinItem): BulletinDraft {
  return {
    kind: item.kind,
    title: item.title,
    details: item.details,
    subjectType: item.subjectType,
    subjectName: item.subjectName,
    status: item.status,
    ownerId: item.ownerId,
    nextAction: item.nextAction,
    dueDate: item.dueDate,
  };
}

export function BulletinEditorDialog({
  open,
  item,
  defaultKind,
  canManage,
  owners,
  ownersLoading = false,
  ownersError = null,
  busy = false,
  serverError = null,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item: BulletinItem | null;
  defaultKind: BulletinKind;
  canManage: boolean;
  owners: BulletinOwner[];
  ownersLoading?: boolean;
  ownersError?: string | null;
  busy?: boolean;
  serverError?: string | null;
  onClose: () => void;
  onSubmit: (draft: BulletinDraft) => void;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState<BulletinDraft>(() => blankDraft(defaultKind));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(item ? draftFromItem(item) : blankDraft(defaultKind));
    setValidationError(null);
  }, [defaultKind, item, open]);

  // Creation and structured editing are management-only. The route, server
  // functions and RLS repeat this boundary, but the dialog also fails closed.
  if (!canManage) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    const result = bulletinDraftInput.safeParse(draft);
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? "Check the bulletin details.");
      return;
    }
    onSubmit(result.data);
  };

  const error = validationError || serverError || ownersError;
  const canSave =
    Boolean(draft.title.trim() && draft.subjectName.trim()) && !busy && !ownersLoading;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-lg p-4 [&>button:last-child]:grid [&>button:last-child]:size-11 [&>button:last-child]:place-items-center sm:p-6">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle>
            {item
              ? `Edit ${boardSingular(item.kind).toLocaleLowerCase("en-GB")}`
              : "New bulletin item"}
          </DialogTitle>
          <DialogDescription>
            {item
              ? "Update the brief, owner, status or next action. Existing timeline updates stay unchanged."
              : canManage
                ? "Capture the work now; it can stay unassigned until an owner is agreed."
                : "Capture the work in your personal Bulletin Board view."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor={`${prefix}-kind`} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Board</span>
              <select
                id={`${prefix}-kind`}
                value={draft.kind}
                disabled={Boolean(item) || busy}
                onChange={(event) => {
                  const kind = event.target.value as BulletinKind;
                  setDraft((current) => ({
                    ...current,
                    kind,
                    subjectType:
                      kind === "deal" || kind === "mandate" ? "club" : current.subjectType,
                  }));
                }}
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
              >
                {BULLETIN_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {boardLabel(kind)}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor={`${prefix}-status`} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Status</span>
              <select
                id={`${prefix}-status`}
                aria-label="Status"
                aria-describedby={!canManage ? `${prefix}-status-help` : undefined}
                value={draft.status}
                disabled={busy || !canManage}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value as BulletinStatus })
                }
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
              >
                {BULLETIN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              {!canManage ? (
                <span
                  id={`${prefix}-status-help`}
                  className="mt-1 block text-[11px] text-muted-foreground"
                >
                  New mentor items start Open. A manager can change the status later.
                </span>
              ) : null}
            </label>

            <label htmlFor={`${prefix}-title`} className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Title <span aria-hidden="true">*</span>
              </span>
              <Input
                id={`${prefix}-title`}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                maxLength={160}
                required
                disabled={busy}
                className="min-h-11 sm:min-h-9"
                placeholder="A short, specific description of the work"
              />
            </label>

            <label htmlFor={`${prefix}-subject-type`} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Subject type
              </span>
              <select
                id={`${prefix}-subject-type`}
                value={draft.subjectType}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, subjectType: event.target.value as BulletinSubjectType })
                }
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
              >
                {BULLETIN_SUBJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SUBJECT_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor={`${prefix}-subject-name`} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Subject <span aria-hidden="true">*</span>
              </span>
              <Input
                id={`${prefix}-subject-name`}
                value={draft.subjectName}
                onChange={(event) => setDraft({ ...draft, subjectName: event.target.value })}
                maxLength={160}
                required
                disabled={busy}
                className="min-h-11 sm:min-h-9"
                placeholder="Club, player, or topic"
              />
            </label>

            <label htmlFor={`${prefix}-details`} className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Brief</span>
              <Textarea
                id={`${prefix}-details`}
                value={draft.details}
                onChange={(event) => setDraft({ ...draft, details: event.target.value })}
                maxLength={8000}
                rows={4}
                disabled={busy}
                placeholder="What does the team need to know?"
              />
            </label>

            <label htmlFor={`${prefix}-next-action`} className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Next action
              </span>
              <Textarea
                id={`${prefix}-next-action`}
                value={draft.nextAction}
                onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })}
                maxLength={500}
                rows={2}
                disabled={busy}
                placeholder="The next concrete action"
              />
            </label>

            {canManage ? (
              <label htmlFor={`${prefix}-owner`} className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Owner</span>
                <select
                  id={`${prefix}-owner`}
                  value={draft.ownerId ?? ""}
                  disabled={busy || ownersLoading}
                  onChange={(event) => setDraft({ ...draft, ownerId: event.target.value || null })}
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                >
                  <option value="">{ownersLoading ? "Loading team…" : "Unassigned"}</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                      {owner.isManager ? " (manager)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label htmlFor={`${prefix}-due-date`} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Due date</span>
              <Input
                id={`${prefix}-due-date`}
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || null })}
                disabled={busy}
                className="min-h-11 sm:min-h-9"
              />
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">
            <span aria-hidden="true">*</span> Required field. Updates can be added from the item
            after it is saved.
          </p>

          <DialogFooter className="gap-2 border-t border-border pt-4 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" className="min-h-11" disabled={!canSave}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {item ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
