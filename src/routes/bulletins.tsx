import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { BulletinEditorDialog } from "@/components/bulletins/bulletin-editor-dialog";
import { clampBulletinPage } from "@/components/bulletins/bulletin-display";
import {
  BulletinAttentionStrip,
  BulletinBoardSelector,
  BulletinWorkspace,
} from "@/components/bulletins/bulletin-workspace";
import { PageHeader } from "@/components/primitives";
import { withPermission } from "@/components/require-permission";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  addBulletinUpdate,
  createBulletin,
  getBulletinDetail,
  getBulletinSummary,
  listBulletinOwners,
  listBulletins,
  updateBulletin,
} from "@/lib/bulletins.functions";
import {
  BULLETIN_KINDS,
  BULLETIN_PAGE_SIZE,
  BULLETIN_STATUSES,
  type BulletinDraft,
  type BulletinItem,
  type BulletinKind,
  type BulletinStatus,
} from "@/lib/bulletins/schema";

const BOARD_VALUES = BULLETIN_KINDS;
const STATUS_FILTER_VALUES = ["all", ...BULLETIN_STATUSES] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bulletinSearchSchema = z.object({
  board: z.enum(BOARD_VALUES).catch("daily_update").default("daily_update"),
  q: fallback(z.string().max(120), "").default(""),
  status: z.enum(STATUS_FILTER_VALUES).catch("all").default("all"),
  page: fallback(z.number().int().min(1), 1).default(1),
  item: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/bulletins")({
  validateSearch: zodValidator(bulletinSearchSchema),
  component: withPermission(BulletinsPage, "bulletins.view"),
});

type BulletinSearch = z.infer<typeof bulletinSearchSchema>;

function errorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

function BulletinsPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/bulletins" });
  const search = Route.useSearch();
  const board = search.board as BulletinKind;
  const status = search.status as "all" | BulletinStatus;
  const safePage = Math.max(1, search.page);
  const selectedId = UUID.test(search.item) ? search.item : "";
  const userId = user?.id ?? "anonymous";
  const scope = can("bulletins.manage") ? "team" : "mine";
  const [updatesPage, setUpdatesPage] = useState(1);

  const fetchSummary = useServerFn(getBulletinSummary);
  const fetchList = useServerFn(listBulletins);
  const fetchDetail = useServerFn(getBulletinDetail);
  const fetchOwners = useServerFn(listBulletinOwners);
  const createItem = useServerFn(createBulletin);
  const editItem = useServerFn(updateBulletin);
  const appendUpdate = useServerFn(addBulletinUpdate);

  const summaryQuery = useQuery({
    queryKey: ["bulletins", userId, scope, "summary"],
    queryFn: () => fetchSummary({ data: { scope } }),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  });

  const listQuery = useQuery({
    queryKey: ["bulletins", userId, scope, "list", board, status, search.q, safePage],
    queryFn: () =>
      fetchList({
        data: {
          kind: board,
          scope,
          status: status === "all" ? undefined : status,
          search: search.q.trim() || undefined,
          page: safePage,
          pageSize: BULLETIN_PAGE_SIZE,
        },
      }),
    enabled: Boolean(user),
    staleTime: 20_000,
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["bulletins", userId, scope, "detail", selectedId, updatesPage],
    queryFn: () => fetchDetail({ data: { id: selectedId, updatesPage, scope } }),
    enabled: Boolean(user) && Boolean(selectedId),
    staleTime: 20_000,
    retry: false,
  });

  const canManage =
    can("bulletins.manage") && Boolean(listQuery.data?.canManage ?? summaryQuery.data?.canManage);
  const [editorItem, setEditorItem] = useState<BulletinItem | null | undefined>(undefined);
  const editorOpen = editorItem !== undefined;

  // A role-preview or account transition must not leave a team edit dialog
  // mounted under a newly personal scope.
  useEffect(() => setEditorItem(undefined), [scope, userId]);

  const ownersQuery = useQuery({
    queryKey: ["bulletins", userId, scope, "owners"],
    queryFn: () => fetchOwners(),
    enabled: Boolean(user) && editorOpen && canManage,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const [searchDraft, setSearchDraft] = useState(search.q);
  useEffect(() => setUpdatesPage(1), [scope, selectedId]);
  useEffect(() => setSearchDraft(search.q), [search.q]);
  useEffect(() => {
    if (searchDraft === search.q) return;
    const timer = window.setTimeout(() => {
      void navigate({
        search: { ...search, q: searchDraft, page: 1, item: "" } as BulletinSearch,
        replace: true,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [navigate, search, search.q, searchDraft]);

  const rows = useMemo(() => listQuery.data?.rows ?? [], [listQuery.data?.rows]);

  useEffect(() => {
    if (!listQuery.data || listQuery.isFetching) return;
    const nextPage = clampBulletinPage(safePage, listQuery.data.pageCount);
    if (nextPage === safePage) return;
    void navigate({
      search: { ...search, page: nextPage, item: "" } as BulletinSearch,
      replace: true,
    });
  }, [listQuery.data, listQuery.isFetching, navigate, safePage, search]);

  // Keep the detail panel useful on desktop while retaining a list-first layout
  // on mobile. A filtered-out or deleted selection is replaced by the first
  // item in the current server page, never by fabricated content.
  useEffect(() => {
    if (!listQuery.data || listQuery.isFetching) return;
    if (safePage !== clampBulletinPage(safePage, listQuery.data.pageCount)) return;
    const visibleSelection = selectedId && listQuery.data.rows.some((row) => row.id === selectedId);
    if (visibleSelection) return;
    const nextId = listQuery.data.rows[0]?.id ?? "";
    if (nextId === search.item) return;
    void navigate({ search: { ...search, item: nextId } as BulletinSearch, replace: true });
  }, [listQuery.data, listQuery.isFetching, navigate, safePage, search, search.item, selectedId]);

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bulletins", userId] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ draft, item }: { draft: BulletinDraft; item: BulletinItem | null }) => {
      if (!item) return createItem({ data: { ...draft, scope } });
      const { kind: _immutableKind, ...editable } = draft;
      return editItem({
        data: { ...editable, scope, id: item.id, expectedVersion: item.version },
      });
    },
    onSuccess: async (saved, variables) => {
      await refreshAll();
      setEditorItem(undefined);
      toast.success(variables.item ? "Bulletin item updated" : "Bulletin item created");
      void navigate({
        search: { board: saved.kind, q: "", status: "all", page: 1, item: saved.id },
        replace: true,
      });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the bulletin item.")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ bulletinId, body }: { bulletinId: string; body: string }) =>
      appendUpdate({ data: { bulletinId, body } }),
    onSuccess: async () => {
      setUpdatesPage(1);
      await refreshAll();
      toast.success("Update added");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not add the update.")),
  });

  const changeSearch = (patch: Partial<BulletinSearch>, replace = false) =>
    void navigate({ search: { ...search, ...patch } as BulletinSearch, replace });

  const refreshButton = (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 sm:min-h-9"
      disabled={listQuery.isFetching || summaryQuery.isFetching}
      onClick={() => void refreshAll()}
    >
      <RefreshCw
        className={listQuery.isFetching || summaryQuery.isFetching ? "animate-spin" : ""}
        aria-hidden="true"
      />
      Refresh
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bulletin Board"
        titleClassName="break-words text-2xl leading-tight sm:text-3xl"
        description={
          scope === "team"
            ? "One operational workspace for daily updates, club needs, leads and mandates."
            : "Your assigned daily updates, club needs, leads and mandates."
        }
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {refreshButton}
            {canManage ? (
              <Button
                type="button"
                className="min-h-11 sm:min-h-9"
                onClick={() => setEditorItem(null)}
              >
                <Plus aria-hidden="true" /> New item
              </Button>
            ) : null}
          </div>
        }
      />

      <BulletinAttentionStrip summary={summaryQuery.data} loading={summaryQuery.isLoading} />

      {summaryQuery.isError ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground"
        >
          Attention counts are temporarily unavailable. The board below can still be used.
        </div>
      ) : null}

      <BulletinBoardSelector
        current={board}
        summary={summaryQuery.data}
        onChange={(nextBoard) => {
          setSearchDraft("");
          changeSearch({ board: nextBoard, q: "", status: "all", page: 1, item: "" });
        }}
      />

      <BulletinWorkspace
        kind={board}
        canManage={canManage}
        rows={rows}
        total={listQuery.data?.total ?? 0}
        page={listQuery.data?.page ?? safePage}
        pageSize={listQuery.data?.pageSize ?? BULLETIN_PAGE_SIZE}
        pageCount={listQuery.data?.pageCount ?? 1}
        selectedId={selectedId || null}
        detail={detailQuery.data}
        search={searchDraft}
        status={status}
        listLoading={listQuery.isLoading}
        listFetching={listQuery.isFetching}
        listError={
          listQuery.isError ? errorMessage(listQuery.error, "The board could not be loaded.") : null
        }
        detailLoading={Boolean(selectedId) && detailQuery.isLoading}
        detailError={
          detailQuery.isError
            ? errorMessage(detailQuery.error, "The item could not be loaded.")
            : null
        }
        addingUpdate={updateMutation.isPending}
        onSearchChange={setSearchDraft}
        onStatusChange={(nextStatus) => changeSearch({ status: nextStatus, page: 1, item: "" })}
        onSelect={(id) => changeSearch({ item: id }, true)}
        onPageChange={(page) => changeSearch({ page, item: "" })}
        onRetryList={() => void listQuery.refetch()}
        onRetryDetail={() => void detailQuery.refetch()}
        onEdit={(item) => setEditorItem(item)}
        onAddUpdate={(body) =>
          updateMutation
            .mutateAsync({ bulletinId: detailQuery.data!.item.id, body })
            .then(() => undefined)
        }
        onUpdatesPageChange={setUpdatesPage}
      />

      <BulletinEditorDialog
        open={editorOpen}
        item={editorItem ?? null}
        defaultKind={board}
        canManage={canManage}
        owners={ownersQuery.data?.rows ?? []}
        ownersLoading={canManage && ownersQuery.isLoading}
        ownersError={
          ownersQuery.isError
            ? "The owner list could not be loaded. You can leave this item unassigned."
            : null
        }
        busy={saveMutation.isPending}
        serverError={
          saveMutation.isError
            ? errorMessage(saveMutation.error, "The item could not be saved.")
            : null
        }
        onClose={() => {
          if (!saveMutation.isPending) {
            setEditorItem(undefined);
            saveMutation.reset();
          }
        }}
        onSubmit={(draft) => saveMutation.mutate({ draft, item: editorItem ?? null })}
      />
    </div>
  );
}
