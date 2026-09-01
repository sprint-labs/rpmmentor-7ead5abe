/**
 * Shared, client-safe contracts for the support inbox and broadcasts.
 *
 * Length bounds match the database CHECK constraints so a client rejection and
 * a server rejection never disagree.
 */
import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SUPPORT_THREAD_KINDS = ["bug", "question"] as const;
export type SupportThreadKind = (typeof SUPPORT_THREAD_KINDS)[number];

export const SUPPORT_THREAD_STATUSES = [
  "open",
  "waiting_on_admin",
  "waiting_on_user",
  "resolved",
] as const;
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];

export const SUPPORT_SEVERITIES = ["low", "medium", "high"] as const;
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number];

export const ANNOUNCEMENT_KINDS = ["feature", "info", "incident", "downtime"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const ANNOUNCEMENT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export const announcementAttachmentInput = z.object({
  path: z.string().trim().min(1).max(500).startsWith("announcements/"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  fileSize: z.number().int().min(1).max(ANNOUNCEMENT_ATTACHMENT_MAX_BYTES),
});

export const SUPPORT_THREAD_STATUS_LABEL: Record<SupportThreadStatus, string> = {
  open: "Open",
  waiting_on_admin: "Waiting on admin",
  waiting_on_user: "Waiting on you",
  resolved: "Resolved",
};

export const createSupportThreadInput = z.object({
  kind: z.enum(SUPPORT_THREAD_KINDS),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Message is required").max(4000),
  /** Bug page path; optional so a bug without page_path still validates. */
  page_path: z.string().trim().max(500).optional(),
  severity: z.enum(SUPPORT_SEVERITIES).optional(),
});
export type CreateSupportThreadInput = z.input<typeof createSupportThreadInput>;

export const replySupportThreadInput = z.object({
  threadId: z.string().regex(UUID, "threadId must be a support_threads.id"),
  body: z.string().trim().min(1, "Message is required").max(4000),
});
export type ReplySupportThreadInput = z.input<typeof replySupportThreadInput>;

export const setSupportThreadStatusInput = z.object({
  threadId: z.string().regex(UUID, "threadId must be a support_threads.id"),
  status: z.enum(SUPPORT_THREAD_STATUSES),
});
export type SetSupportThreadStatusInput = z.input<typeof setSupportThreadStatusInput>;

export const getSupportThreadQuery = z.object({
  threadId: z.string().regex(UUID, "threadId must be a support_threads.id"),
});

export const listAllSupportThreadsQuery = z.object({
  kind: z.enum(SUPPORT_THREAD_KINDS).optional(),
  status: z.enum(SUPPORT_THREAD_STATUSES).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type ListAllSupportThreadsQuery = z.input<typeof listAllSupportThreadsQuery>;

export const createAnnouncementInput = z
  .object({
    kind: z.enum(ANNOUNCEMENT_KINDS),
    title: z.string().trim().min(1, "Title is required").max(160),
    body: z.string().trim().max(4000).default(""),
    startsAt: z.string().datetime({ offset: true }).nullish(),
    endsAt: z.string().datetime({ offset: true }).nullish(),
    attachment: announcementAttachmentInput.nullish(),
  })
  .superRefine((input, context) => {
    if (input.attachment && input.kind !== "feature" && input.kind !== "info") {
      context.addIssue({
        code: "custom",
        path: ["attachment"],
        message: "Media can only be attached to feature and update broadcasts",
      });
    }
    if (!input.endsAt) return;
    const startMs = input.startsAt ? Date.parse(input.startsAt) : Date.now();
    if (Date.parse(input.endsAt) <= startMs) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after the broadcast starts",
      });
    }
  });
export type CreateAnnouncementInput = z.input<typeof createAnnouncementInput>;

export const listAnnouncementsAdminQuery = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(30),
});

export const endAnnouncementInput = z.object({
  announcementId: z.string().regex(UUID, "announcementId must be an announcements.id"),
});

export const discardAnnouncementDraftInput = endAnnouncementInput;

export const createAnnouncementUploadTargetInput = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive(),
});

export const markAnnouncementReadInput = z.object({
  announcementId: z.string().regex(UUID, "announcementId must be an announcements.id"),
});

/** Compose a bug message body from the structured form fields. */
export function composeBugBody(input: {
  whatHappened: string;
  whatExpected: string;
  pagePath: string;
}): string {
  const what = input.whatHappened.trim();
  const expected = input.whatExpected.trim();
  const page = input.pagePath.trim() || "(unknown page)";
  return [`What happened: ${what}`, `What I expected: ${expected}`, `Page: ${page}`].join("\n\n");
}

/** Auto-compose a subject when the user leaves it blank. */
export function composeBugSubject(pagePath: string, firstLine: string): string {
  const page = pagePath.trim() || "unknown page";
  const line = firstLine.trim().split("\n")[0]?.slice(0, 80) || "Bug report";
  return `Bug on ${page}: ${line}`.slice(0, 200);
}

export interface SupportMessage {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface SupportThread {
  id: string;
  kind: SupportThreadKind;
  subject: string;
  status: SupportThreadStatus;
  authorId: string;
  pagePath: string;
  severity: SupportSeverity;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface SupportThreadDetail extends SupportThread {
  messages: SupportMessage[];
}

export interface AnnouncementAttachment {
  path: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string | null;
}

export interface AnnouncementUploadTarget {
  path: string;
  token: string;
}

export interface AnnouncementRow {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  readAt: string | null;
  attachments?: AnnouncementAttachment[];
}
