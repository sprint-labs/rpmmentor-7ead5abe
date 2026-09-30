import {
  createFileRoute,
  Link,
  useCanGoBack,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { withPermission } from "@/components/require-permission";
import { InteractionDetail } from "@/components/interaction-workbench";
import { InteractionActions } from "@/components/interactions/interaction-actions";
import { DeleteInteractionDialog } from "@/components/interactions/delete-interaction-dialog";
import { WorkflowDialog } from "@/components/workflows";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { formatDateOnly, type LoggedInteraction } from "@/lib/interactions/schema";

/**
 * One interaction on its own page. Phones open records here from the
 * Interactions list; on wider screens the same record shows beside the list.
 */
export const Route = createFileRoute("/interactions_/$interactionId")({
  head: () => ({
    meta: [{ title: "Interaction — Mentor Hub" }, { name: "robots", content: "noindex" }],
  }),
  component: withPermission(InteractionPage, "interactions.view"),
});

function InteractionPage() {
  const { interactionId } = Route.useParams();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useLoggedInteractions();
  const [editing, setEditing] = useState<LoggedInteraction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LoggedInteraction | null>(null);

  const interaction = (data ?? []).find((i) => i.id === interactionId) ?? null;

  // Back keeps the list's period, filters and scroll position when there is
  // somewhere to go back to; a shared link falls back to the full list.
  const goBack = () => {
    if (canGoBack) router.history.back();
    else navigate({ to: "/interactions" });
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex min-h-9 items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" /> Interactions
      </button>

      <div className="command-panel p-4 sm:p-5">
        {isLoading ? (
          <Message label="Loading…" />
        ) : isError ? (
          <Message label="This interaction could not be loaded. Please refresh." />
        ) : !interaction ? (
          <div className="py-10 text-center">
            <Message label="Interaction not found" />
            <p className="mt-2 text-xs text-muted-foreground">
              It may have been deleted, or you may not have access to it.
            </p>
            <Link
              to="/interactions"
              className="mt-4 inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs hover:bg-accent/40"
            >
              Back to Interactions
            </Link>
          </div>
        ) : (
          <>
            <h1 className="break-words text-2xl font-semibold tracking-tight">
              {interaction.goalkeeperName}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {interaction.interactionType} · {formatDateOnly(interaction.occurredAt)}
            </p>
            <InteractionDetail
              key={interaction.id}
              interaction={interaction}
              actions={
                <InteractionActions
                  interaction={interaction}
                  onEdit={setEditing}
                  onDelete={setPendingDelete}
                />
              }
            />
          </>
        )}
      </div>

      <WorkflowDialog
        kind={editing ? "interaction" : null}
        editingInteraction={editing}
        onClose={() => setEditing(null)}
      />
      <DeleteInteractionDialog
        interaction={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={() => navigate({ to: "/interactions", replace: true })}
      />
    </div>
  );
}

function Message({ label }: { label: string }) {
  return (
    <div className="py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
  );
}
