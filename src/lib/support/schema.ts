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
export const ANNOUNCEMENT_ATTACHMENT_UNAVAILABLE_MESSAGE =
  "Media attachments are unavailable until the Broadcast storage security migration is applied.";

export const ANNOUNCEMENT_ATTACHMENT_MIME_BY_EXTENSION = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  webm: ["video/webm", "audio/webm"],
  mp3: ["audio/mpeg"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  wav: ["audio/wav"],
  aac: ["audio/aac"],
  pdf: ["application/pdf"],
} as const;

export const ANNOUNCEMENT_ATTACHMENT_ACCEPT = Array.from(
  new Set(Object.values(ANNOUNCEMENT_ATTACHMENT_MIME_BY_EXTENSION).flat()),
).join(",");

export function isAnnouncementAttachmentTypeAllowed(name: string, mime: string): boolean {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const accepted = ANNOUNCEMENT_ATTACHMENT_MIME_BY_EXTENSION[
    extension as keyof typeof ANNOUNCEMENT_ATTACHMENT_MIME_BY_EXTENSION
  ] as readonly string[] | undefined;
  return Boolean(accepted?.includes(mime.trim().toLowerCase()));
}

export interface AnnouncementAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export const announcementAttachmentInput = z
  .object({
    path: z.string().trim().min(1).max(500).startsWith("announcements/"),
    name: z.string().trim().min(1).max(255),
    mime: z.string().trim().toLowerCase().min(1).max(150),
    size: z.number().int().min(0).max(ANNOUNCEMENT_ATTACHMENT_MAX_BYTES),
  })
  .superRefine((attachment, context) => {
    if (!isAnnouncementAttachmentTypeAllowed(attachment.name, attachment.mime)) {
      context.addIssue({
        code: "custom",
        path: ["mime"],
        message: "Attachment type does not match an allowed file extension.",
      });
    }
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
  .superRefine((announcement, context) => {
    if (
      announcement.startsAt &&
      announcement.endsAt &&
      Date.parse(announcement.endsAt) <= Date.parse(announcement.startsAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end time must be after the publish time.",
      });
    }
  });
export type CreateAnnouncementInput = z.input<typeof createAnnouncementInput>;

export const endAnnouncementInput = z.object({
  announcementId: z.string().regex(UUID, "announcementId must be an announcements.id"),
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
  attachment: AnnouncementAttachment | null;
}
