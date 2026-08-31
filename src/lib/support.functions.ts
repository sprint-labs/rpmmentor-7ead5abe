/**
 * Support inbox and Super Admin broadcast server functions.
 *
 * Identity is always taken from `context.userId`. Privileged operations also
 * call `requireRole` so an unauthorised call fails with a clear message;
 * Row Level Security remains the backstop.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole, SUPPORT_INBOX_ROLES } from "@/lib/roles.server";
import { MEDIA_BUCKET } from "@/lib/storage/bucket";
import {
  MAX_ANNOUNCEMENT_ATTACHMENTS,
  buildAnnouncementObjectName,
  originalAnnouncementFileName,
  validateAnnouncementAttachment,
} from "@/lib/support/announcement-attachment-rules";
import {
  ANNOUNCEMENT_KINDS,
  SUPPORT_SEVERITIES,
  SUPPORT_THREAD_KINDS,
  SUPPORT_THREAD_STATUSES,
  createAnnouncementInput,
  createAnnouncementUploadTargetInput,
  createSupportThreadInput,
  discardAnnouncementDraftInput,
  endAnnouncementInput,
  getSupportThreadQuery,
  listAllSupportThreadsQuery,
  listAnnouncementsAdminQuery,
  markAnnouncementReadInput,
  publishAnnouncementInput,
  replySupportThreadInput,
  setSupportThreadStatusInput,
  type AnnouncementAttachment,
  type AnnouncementKind,
  type AnnouncementRow,
  type AnnouncementUploadTarget,
  type SupportMessage,
  type SupportSeverity,
  type SupportThread,
  type SupportThreadDetail,
  type SupportThreadKind,
  type SupportThreadStatus,
} from "@/lib/support/schema";

type AuthedClient = SupabaseClient<Database>;

type ThreadRow = {
  id: string;
  kind: string;
  subject: string;
  status: string;
  author_id: string;
  page_path: string;
  severity: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type AnnouncementDbRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
};

function asThreadKind(value: string): SupportThreadKind {
  return (SUPPORT_THREAD_KINDS as readonly string[]).includes(value)
    ? (value as SupportThreadKind)
    : "question";
}

function asThreadStatus(value: string): SupportThreadStatus {
  return (SUPPORT_THREAD_STATUSES as readonly string[]).includes(value)
    ? (value as SupportThreadStatus)
    : "open";
}

function asSeverity(value: string): SupportSeverity {
  return (SUPPORT_SEVERITIES as readonly string[]).includes(value)
    ? (value as SupportSeverity)
    : "medium";
}

function asAnnouncementKind(value: string): AnnouncementKind {
  return (ANNOUNCEMENT_KINDS as readonly string[]).includes(value)
    ? (value as AnnouncementKind)
    : "info";
}

function mapThread(row: ThreadRow): SupportThread {
  return {
    id: row.id,
    kind: asThreadKind(row.kind),
    subject: row.subject,
    status: asThreadStatus(row.status),
    authorId: row.author_id,
    pagePath: row.page_path ?? "",
    severity: asSeverity(row.severity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function mapMessage(row: MessageRow): SupportMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapAnnouncement(
  row: AnnouncementDbRow,
  readAt: string | null,
  attachments: AnnouncementAttachment[] = [],
): AnnouncementRow {
  return {
    id: row.id,
    kind: asAnnouncementKind(row.kind),
    title: row.title,
    body: row.body ?? "",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    readAt,
    attachments,
  };
}

const THREAD_COLUMNS =
  "id, kind, subject, status, author_id, page_path, severity, created_at, updated_at, last_message_at";
const MESSAGE_COLUMNS = "id, thread_id, author_id, body, created_at";
const ANNOUNCEMENT_COLUMNS =
  "id, kind, title, body, starts_at, ends_at, active, created_by, created_at";
const ANNOUNCEMENT_FOLDER = "announcements";
const DRAFT_WINDOW_MS = 30 * 60 * 1000;

function announcementFolder(announcementId: string): string {
  return `${ANNOUNCEMENT_FOLDER}/${announcementId}`;
}

function draftCutoffIso(): string {
  return new Date(Date.now() - DRAFT_WINDOW_MS).toISOString();
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function metadataSize(metadata: Record<string, unknown>): number {
  if (typeof metadata.size === "number" && Number.isFinite(metadata.size)) return metadata.size;
  if (typeof metadata.size === "string") {
    const parsed = Number(metadata.size);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function listAnnouncementObjectPaths(
  supabase: AuthedClient,
  announcementId: string,
): Promise<string[]> {
  const folder = announcementFolder(announcementId);
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder, {
    limit: MAX_ANNOUNCEMENT_ATTACHMENTS + 1,
    sortBy: { column: "created_at", order: "asc" },
  });

  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((item) => Boolean(item.id) && item.name !== ".emptyFolderPlaceholder")
    .map((item) => `${folder}/${item.name}`);
}

async function loadAnnouncementAttachments(
  supabase: AuthedClient,
  announcementId: string,
): Promise<AnnouncementAttachment[]> {
  const folder = announcementFolder(announcementId);
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder, {
    limit: MAX_ANNOUNCEMENT_ATTACHMENTS,
    sortBy: { column: "created_at", order: "asc" },
  });

  if (error) {
    console.warn(`Could not list attachments for announcement ${announcementId}: ${error.message}`);
    return [];
  }

  const files = (data ?? []).filter(
    (item) => Boolean(item.id) && item.name !== ".emptyFolderPlaceholder",
  );

  return Promise.all(
    files.map(async (file) => {
      const path = `${folder}/${file.name}`;
      const metadata = metadataRecord(file.metadata);
      const { data: signed, error: signedError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(path, 60 * 60);

      return {
        path,
        fileName: originalAnnouncementFileName(file.name),
        mimeType:
          typeof metadata.mimetype === "string"
            ? metadata.mimetype
            : typeof metadata.contentType === "string"
              ? metadata.contentType
              : "application/octet-stream",
        fileSize: metadataSize(metadata),
        url: signedError ? null : signed.signedUrl,
      };
    }),
  );
}

async function mapAnnouncementWithAttachments(
  supabase: AuthedClient,
  row: AnnouncementDbRow,
  readAt: string | null,
): Promise<AnnouncementRow> {
  const attachments = await loadAnnouncementAttachments(supabase, row.id);
  return mapAnnouncement(row, readAt, attachments);
}

export const createSupportThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createSupportThreadInput.parse(data))
  .handler(async ({ data, context }): Promise<SupportThreadDetail> => {
    const { supabase, userId } = context;
    const pagePath = data.page_path?.trim() ?? "";
    const severity = data.severity ?? "medium";

    const { data: thread, error: threadError } = await supabase
      .from("support_threads")
      .insert({
        kind: data.kind,
        subject: data.subject,
        author_id: userId,
        page_path: data.kind === "bug" ? pagePath : "",
        severity: data.kind === "bug" ? severity : "medium",
        status: "open",
      })
      .select(THREAD_COLUMNS)
      .single();

    if (threadError || !thread) {
      throw new Error(threadError?.message ?? "Could not open the support thread.");
    }

    const { data: message, error: messageError } = await supabase
      .from("support_messages")
      .insert({
        thread_id: thread.id,
        author_id: userId,
        body: data.body,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (messageError || !message) {
      await supabase.from("support_threads").delete().eq("id", thread.id);
      throw new Error(messageError?.message ?? "Could not save the first support message.");
    }

    const { data: refreshed, error: refreshError } = await supabase
      .from("support_threads")
      .select(THREAD_COLUMNS)
      .eq("id", thread.id)
      .single();
    if (refreshError || !refreshed) {
      throw new Error(refreshError?.message ?? "Could not confirm the support thread.");
    }

    return {
      ...mapThread(refreshed as ThreadRow),
      messages: [mapMessage(message as MessageRow)],
    };
  });

export const replySupportThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => replySupportThreadInput.parse(data))
  .handler(async ({ data, context }): Promise<SupportMessage> => {
    const { data: message, error } = await context.supabase
      .from("support_messages")
      .insert({
        thread_id: data.threadId,
        author_id: context.userId,
        body: data.body,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error || !message) {
      throw new Error(error?.message ?? "Could not send the reply.");
    }
    return mapMessage(message as MessageRow);
  });

/**
 * Own threads only. Super Admin RLS would otherwise return every thread, so
 * this handler always filters to the caller's author_id.
 */
export const listMySupportThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupportThread[]> => {
    const { data, error } = await context.supabase
      .from("support_threads")
      .select(THREAD_COLUMNS)
      .eq("author_id", context.userId)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapThread(row as ThreadRow));
  });

export const listAllSupportThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => listAllSupportThreadsQuery.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: SupportThread[]; total: number }> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "view the support inbox",
    );

    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = context.supabase
      .from("support_threads")
      .select(THREAD_COLUMNS, { count: "exact" })
      .order("last_message_at", { ascending: false })
      .range(from, to);
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.status) query = query.eq("status", data.status);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((row) => mapThread(row as ThreadRow)),
      total: count ?? 0,
    };
  });

export const getSupportThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => getSupportThreadQuery.parse(data))
  .handler(async ({ data, context }): Promise<SupportThreadDetail> => {
    const { data: thread, error: threadError } = await context.supabase
      .from("support_threads")
      .select(THREAD_COLUMNS)
      .eq("id", data.threadId)
      .maybeSingle();
    if (threadError) throw new Error(threadError.message);
    if (!thread) throw new Error("That support thread was not found.");

    const { data: messages, error: messageError } = await context.supabase
      .from("support_messages")
      .select(MESSAGE_COLUMNS)
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (messageError) throw new Error(messageError.message);

    return {
      ...mapThread(thread as ThreadRow),
      messages: (messages ?? []).map((row) => mapMessage(row as MessageRow)),
    };
  });

export const setSupportThreadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => setSupportThreadStatusInput.parse(data))
  .handler(async ({ data, context }): Promise<SupportThread> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "update support thread status",
    );

    const { data: updated, error } = await context.supabase
      .from("support_threads")
      .update({ status: data.status })
      .eq("id", data.threadId)
      .select(THREAD_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That support thread was not found.");
    return mapThread(updated as ThreadRow);
  });

export const listActiveAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnnouncementRow[]> => {
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await context.supabase
      .from("announcements")
      .select(ANNOUNCEMENT_COLUMNS)
      .eq("active", true)
      .lte("starts_at", nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);

    const announcements = (rows ?? []) as AnnouncementDbRow[];
    if (announcements.length === 0) return [];

    const ids = announcements.map((row) => row.id);
    const { data: reads, error: readsError } = await context.supabase
      .from("announcement_reads")
      .select("announcement_id, read_at")
      .eq("user_id", context.userId)
      .in("announcement_id", ids);
    if (readsError) throw new Error(readsError.message);

    const readById = new Map(
      (reads ?? []).map((row) => [row.announcement_id as string, (row.read_at as string) ?? null]),
    );

    return Promise.all(
      announcements.map((row) =>
        mapAnnouncementWithAttachments(context.supabase, row, readById.get(row.id) ?? null),
      ),
    );
  });

export const listAnnouncementsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => listAnnouncementsAdminQuery.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: AnnouncementRow[]; total: number }> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "view all broadcasts",
    );

    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 30;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: rows, error, count } = await context.supabase
      .from("announcements")
      .select(ANNOUNCEMENT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);

    return {
      rows: await Promise.all(
        ((rows ?? []) as AnnouncementDbRow[]).map((row) =>
          mapAnnouncementWithAttachments(context.supabase, row, null),
        ),
      ),
      total: count ?? 0,
    };
  });

export const markAnnouncementRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => markAnnouncementReadInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("announcement_reads").upsert(
      {
        announcement_id: data.announcementId,
        user_id: context.userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createAnnouncementInput.parse(data))
  .handler(async ({ data, context }): Promise<AnnouncementRow> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "create announcements",
    );

    const { data: inserted, error } = await context.supabase
      .from("announcements")
      .insert({
        kind: data.kind,
        title: data.title,
        body: data.body ?? "",
        starts_at: data.startsAt ?? new Date().toISOString(),
        ends_at: data.endsAt ?? null,
        created_by: context.userId,
        active: !data.deferActivation,
      })
      .select(ANNOUNCEMENT_COLUMNS)
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "Could not create the announcement.");
    }
    return mapAnnouncement(inserted as AnnouncementDbRow, null);
  });

export const createAnnouncementUploadTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createAnnouncementUploadTargetInput.parse(data))
  .handler(async ({ data, context }): Promise<AnnouncementUploadTarget> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "attach media to announcements",
    );

    const validationError = validateAnnouncementAttachment({
      name: data.fileName,
      type: data.mimeType,
      size: data.fileSize,
    });
    if (validationError) throw new Error(validationError);

    const { data: announcement, error: announcementError } = await context.supabase
      .from("announcements")
      .select("id, kind, active, created_by, created_at")
      .eq("id", data.announcementId)
      .eq("created_by", context.userId)
      .eq("active", false)
      .gte("created_at", draftCutoffIso())
      .maybeSingle();
    if (announcementError) throw new Error(announcementError.message);
    if (!announcement) {
      throw new Error("This broadcast draft is unavailable or has already been published.");
    }
    if (announcement.kind !== "feature" && announcement.kind !== "info") {
      throw new Error("Media can only be attached to feature and update broadcasts.");
    }

    const existingPaths = await listAnnouncementObjectPaths(context.supabase, data.announcementId);
    if (existingPaths.length >= MAX_ANNOUNCEMENT_ATTACHMENTS) {
      throw new Error(`A broadcast can have up to ${MAX_ANNOUNCEMENT_ATTACHMENTS} attachments.`);
    }

    const objectName = buildAnnouncementObjectName(data.fileName, crypto.randomUUID());
    const path = `${announcementFolder(data.announcementId)}/${objectName}`;
    const { data: signed, error } = await context.supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !signed) {
      throw new Error(error?.message ?? "Could not prepare the media upload.");
    }

    return { path, token: signed.token };
  });

export const publishAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => publishAnnouncementInput.parse(data))
  .handler(async ({ data, context }): Promise<AnnouncementRow> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "publish announcements",
    );

    const { data: updated, error } = await context.supabase
      .from("announcements")
      .update({ active: true })
      .eq("id", data.announcementId)
      .eq("created_by", context.userId)
      .eq("active", false)
      .gte("created_at", draftCutoffIso())
      .select(ANNOUNCEMENT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (updated) {
      return mapAnnouncementWithAttachments(context.supabase, updated as AnnouncementDbRow, null);
    }

    const { data: current, error: currentError } = await context.supabase
      .from("announcements")
      .select(ANNOUNCEMENT_COLUMNS)
      .eq("id", data.announcementId)
      .eq("created_by", context.userId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (current?.active) {
      return mapAnnouncementWithAttachments(context.supabase, current as AnnouncementDbRow, null);
    }

    throw new Error("This broadcast draft is unavailable or too old to publish.");
  });

export const discardAnnouncementDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => discardAnnouncementDraftInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "discard announcement drafts",
    );

    const { data: draft, error: draftError } = await context.supabase
      .from("announcements")
      .select("id")
      .eq("id", data.announcementId)
      .eq("created_by", context.userId)
      .eq("active", false)
      .gte("created_at", draftCutoffIso())
      .maybeSingle();
    if (draftError) throw new Error(draftError.message);
    if (!draft) return { ok: true };

    const paths = await listAnnouncementObjectPaths(context.supabase, data.announcementId);
    if (paths.length > 0) {
      const { error: removeError } = await context.supabase.storage.from(MEDIA_BUCKET).remove(paths);
      if (removeError) throw new Error(removeError.message);
    }

    const { error: deleteError } = await context.supabase
      .from("announcements")
      .delete()
      .eq("id", data.announcementId)
      .eq("active", false);
    if (deleteError) throw new Error(deleteError.message);
    return { ok: true };
  });

export const endAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => endAnnouncementInput.parse(data))
  .handler(async ({ data, context }): Promise<AnnouncementRow> => {
    await requireRole(context.supabase, context.userId, SUPPORT_INBOX_ROLES, "end announcements");

    const nowIso = new Date().toISOString();
    const { data: updated, error } = await context.supabase
      .from("announcements")
      .update({ active: false, ends_at: nowIso })
      .eq("id", data.announcementId)
      .select(ANNOUNCEMENT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That announcement was not found.");
    return mapAnnouncementWithAttachments(context.supabase, updated as AnnouncementDbRow, null);
  });
