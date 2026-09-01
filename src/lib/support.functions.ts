/**
 * Support inbox and Super Admin broadcast server functions.
 *
 * Identity is always taken from `context.userId`. Privileged operations also
 * call `requireRole` so an unauthorised call fails with a clear message;
 * Row Level Security remains the backstop.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole, SUPPORT_INBOX_ROLES } from "@/lib/roles.server";
import {
  ADMIN_RECENT_ANNOUNCEMENT_LIMIT,
  endedAtForAnnouncement,
  mergeAdminAnnouncementPages,
} from "@/lib/support/admin-announcements";
import {
  ANNOUNCEMENT_COLUMNS,
  LEGACY_ANNOUNCEMENT_COLUMNS,
  queryAnnouncementsWithSchemaCompatibility,
} from "@/lib/support/announcement-schema-compat";
import { requireAnnouncementMediaStorageReady } from "@/lib/support/announcement-media-capability";
import {
  ANNOUNCEMENT_KINDS,
  SUPPORT_SEVERITIES,
  SUPPORT_THREAD_KINDS,
  SUPPORT_THREAD_STATUSES,
  createAnnouncementInput,
  createSupportThreadInput,
  endAnnouncementInput,
  getSupportThreadQuery,
  listAllSupportThreadsQuery,
  markAnnouncementReadInput,
  replySupportThreadInput,
  setSupportThreadStatusInput,
  type AnnouncementAttachment,
  type AnnouncementKind,
  type AnnouncementRow,
  type SupportMessage,
  type SupportSeverity,
  type SupportThread,
  type SupportThreadDetail,
  type SupportThreadKind,
  type SupportThreadStatus,
} from "@/lib/support/schema";

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
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
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

function mapAnnouncement(row: AnnouncementDbRow, readAt: string | null): AnnouncementRow {
  const attachmentSize = row.attachment_size;
  const attachment: AnnouncementAttachment | null =
    row.attachment_path && row.attachment_name && row.attachment_mime && attachmentSize != null
      ? {
          path: row.attachment_path,
          name: row.attachment_name,
          mime: row.attachment_mime,
          size: attachmentSize,
        }
      : null;

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
    attachment,
  };
}

const THREAD_COLUMNS =
  "id, kind, subject, status, author_id, page_path, severity, created_at, updated_at, last_message_at";
const MESSAGE_COLUMNS = "id, thread_id, author_id, body, created_at";
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
    const { data: rows, error } = await queryAnnouncementsWithSchemaCompatibility(
      () =>
        context.supabase
          .from("announcements")
          .select(ANNOUNCEMENT_COLUMNS)
          .eq("active", true)
          .lte("starts_at", nowIso)
          .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
          .order("starts_at", { ascending: false }),
      () =>
        context.supabase
          .from("announcements")
          .select(LEGACY_ANNOUNCEMENT_COLUMNS)
          .eq("active", true)
          .lte("starts_at", nowIso)
          .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
          .order("starts_at", { ascending: false }),
    );
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

    return announcements.map((row) => mapAnnouncement(row, readById.get(row.id) ?? null));
  });

export const listAdminAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnnouncementRow[]> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPPORT_INBOX_ROLES,
      "view all announcements",
    );

    const nowIso = new Date().toISOString();
    const currentQuery = queryAnnouncementsWithSchemaCompatibility(
      () =>
        context.supabase
          .from("announcements")
          .select(ANNOUNCEMENT_COLUMNS)
          .eq("active", true)
          .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
          .order("starts_at", { ascending: false }),
      () =>
        context.supabase
          .from("announcements")
          .select(LEGACY_ANNOUNCEMENT_COLUMNS)
          .eq("active", true)
          .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
          .order("starts_at", { ascending: false }),
    );
    const recentQuery = queryAnnouncementsWithSchemaCompatibility(
      () =>
        context.supabase
          .from("announcements")
          .select(ANNOUNCEMENT_COLUMNS)
          .or(`active.eq.false,ends_at.lte.${nowIso}`)
          .order("starts_at", { ascending: false })
          .limit(ADMIN_RECENT_ANNOUNCEMENT_LIMIT),
      () =>
        context.supabase
          .from("announcements")
          .select(LEGACY_ANNOUNCEMENT_COLUMNS)
          .or(`active.eq.false,ends_at.lte.${nowIso}`)
          .order("starts_at", { ascending: false })
          .limit(ADMIN_RECENT_ANNOUNCEMENT_LIMIT),
    );

    const [currentResult, recentResult] = await Promise.all([currentQuery, recentQuery]);
    if (currentResult.error) throw new Error(currentResult.error.message);
    if (recentResult.error) throw new Error(recentResult.error.message);

    return mergeAdminAnnouncementPages(
      (currentResult.data ?? []) as AnnouncementDbRow[],
      (recentResult.data ?? []) as AnnouncementDbRow[],
    ).map((row) => mapAnnouncement(row, null));
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

    const startsAt = data.startsAt ?? new Date().toISOString();
    if (data.endsAt && Date.parse(data.endsAt) <= Date.parse(startsAt)) {
      throw new Error("The end time must be after the publish time.");
    }

    if (data.attachment) {
      await requireAnnouncementMediaStorageReady((name) => context.supabase.rpc(name));
    }

    const insertQuery = context.supabase.from("announcements").insert({
      kind: data.kind,
      title: data.title,
      body: data.body ?? "",
      starts_at: startsAt,
      ends_at: data.endsAt ?? null,
      ...(data.attachment
        ? {
            attachment_path: data.attachment.path,
            attachment_name: data.attachment.name,
            attachment_mime: data.attachment.mime,
            attachment_size: data.attachment.size,
          }
        : {}),
      created_by: context.userId,
      active: true,
    });
    const { data: inserted, error } = data.attachment
      ? await insertQuery.select(ANNOUNCEMENT_COLUMNS).single()
      : await insertQuery.select(LEGACY_ANNOUNCEMENT_COLUMNS).single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "Could not create the announcement.");
    }
    return mapAnnouncement(inserted as AnnouncementDbRow, null);
  });

export const endAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => endAnnouncementInput.parse(data))
  .handler(async ({ data, context }): Promise<AnnouncementRow> => {
    await requireRole(context.supabase, context.userId, SUPPORT_INBOX_ROLES, "end announcements");

    const nowIso = new Date().toISOString();
    const { data: existing, error: existingError } =
      await queryAnnouncementsWithSchemaCompatibility(
        () =>
          context.supabase
            .from("announcements")
            .select(ANNOUNCEMENT_COLUMNS)
            .eq("id", data.announcementId)
            .maybeSingle(),
        () =>
          context.supabase
            .from("announcements")
            .select(LEGACY_ANNOUNCEMENT_COLUMNS)
            .eq("id", data.announcementId)
            .maybeSingle(),
      );
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("That announcement was not found.");
    const existingAnnouncement = existing as unknown as AnnouncementDbRow;

    const { data: updated, error } = await context.supabase
      .from("announcements")
      .update({
        active: false,
        ends_at: endedAtForAnnouncement(existingAnnouncement.starts_at, nowIso),
      })
      .eq("id", data.announcementId)
      .select(LEGACY_ANNOUNCEMENT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That announcement was not found.");
    return mapAnnouncement({ ...existingAnnouncement, ...(updated as AnnouncementDbRow) }, null);
  });
