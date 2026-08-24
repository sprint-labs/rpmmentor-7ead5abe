/**
 * Rendered title/body/link_path for support bell notifications.
 *
 * Stored at write time (same principle as event notification-copy): the inbox
 * shows what the person was actually told.
 */
import type { SupportThreadKind } from "./schema";

export type SupportNotificationKind = "support_thread_opened" | "support_reply";

export interface SupportNotificationCopy {
  kind: SupportNotificationKind;
  title: string;
  body: string;
  linkPath: string;
}

const PREVIEW_MAX = 160;

export function truncatePreview(body: string, max = PREVIEW_MAX): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function supportThreadLinkPath(threadId: string): string {
  return `/support?thread=${threadId}`;
}

export function buildSupportThreadOpenedCopy(input: {
  threadId: string;
  kind: SupportThreadKind;
  subject: string;
  body: string;
}): SupportNotificationCopy {
  const title = input.kind === "bug" ? "New bug report" : "New question";
  const preview = truncatePreview(input.body);
  return {
    kind: "support_thread_opened",
    title,
    body: `${input.subject}\n${preview}`,
    linkPath: supportThreadLinkPath(input.threadId),
  };
}

export function buildSupportReplyCopy(input: {
  threadId: string;
  body: string;
}): SupportNotificationCopy {
  return {
    kind: "support_reply",
    title: "Support reply",
    body: truncatePreview(input.body),
    linkPath: supportThreadLinkPath(input.threadId),
  };
}
