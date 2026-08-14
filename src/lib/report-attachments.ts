/**
 * Pure helpers for report attachment identity handling (no I/O, no Supabase).
 *
 * A report can carry attachments under more than one historical identity:
 * the legacy `mr_` id and the current `mr2_` id. Detail views must show both.
 */
export interface AttachmentLike {
  id: string;
}

/** Every id a report's attachments may be stored under, de-duplicated. */
export function attachmentLookupIds(...ids: (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((x): x is string => !!x && x.trim().length > 0)));
}

/** Merge attachment result sets, keeping first-seen order and deduping by id. */
export function mergeAttachments<T extends AttachmentLike>(...groups: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const a of group ?? []) {
      if (!a || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}
