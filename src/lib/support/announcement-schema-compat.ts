export const LEGACY_ANNOUNCEMENT_COLUMNS =
  "id, kind, title, body, starts_at, ends_at, active, created_by, created_at" as const;

export const ANNOUNCEMENT_COLUMNS =
  "id, kind, title, body, starts_at, ends_at, active, created_by, created_at, attachment_path, attachment_name, attachment_mime, attachment_size" as const;

type AnnouncementQueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type AnnouncementQueryResult<T, E extends AnnouncementQueryError = AnnouncementQueryError> = {
  data: T | null;
  error: E | null;
};

const ATTACHMENT_COLUMNS = [
  "attachment_path",
  "attachment_name",
  "attachment_mime",
  "attachment_size",
];

export function isMissingAnnouncementAttachmentColumn(
  error: AnnouncementQueryError | null | undefined,
): boolean {
  if (!error || (error.code !== "42703" && error.code !== "PGRST204")) return false;
  const description = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return ATTACHMENT_COLUMNS.some((column) => description.includes(column));
}

export async function queryAnnouncementsWithSchemaCompatibility<
  TCurrent,
  TLegacy,
  E extends AnnouncementQueryError = AnnouncementQueryError,
>(
  currentQuery: () => PromiseLike<AnnouncementQueryResult<TCurrent, E>>,
  legacyQuery: () => PromiseLike<AnnouncementQueryResult<TLegacy, E>>,
): Promise<AnnouncementQueryResult<TCurrent | TLegacy, E>> {
  const current = await currentQuery();
  if (!isMissingAnnouncementAttachmentColumn(current.error)) return current;
  return legacyQuery();
}
