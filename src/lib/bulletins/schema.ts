/**
 * Client-safe contracts for the internal Bulletin Board.
 *
 * These bounds mirror the database constraints in the forward migration. IDs,
 * authorship and owner display names are never accepted as free text: the
 * server derives or confirms them against the signed-in account directory.
 */
import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const BULLETIN_KINDS = ["daily_update", "deal", "lead", "mandate"] as const;
export type BulletinKind = (typeof BULLETIN_KINDS)[number];

export const BULLETIN_STATUSES = ["open", "working", "blocked", "closed"] as const;
export type BulletinStatus = (typeof BULLETIN_STATUSES)[number];

export const BULLETIN_SUBJECT_TYPES = ["club", "player", "other"] as const;
export type BulletinSubjectType = (typeof BULLETIN_SUBJECT_TYPES)[number];

/**
 * Requested workspace perspective. The server always clamps this against the
 * caller's stored roles; it is never itself an authority signal.
 */
export const BULLETIN_SCOPES = ["mine", "team"] as const;
export type BulletinScope = (typeof BULLETIN_SCOPES)[number];

export const BULLETIN_PAGE_SIZE = 20;
export const BULLETIN_UPDATES_PAGE_SIZE = 20;

/** Fields collected when a new item is created. */
export const bulletinDraftInput = z.object({
  kind: z.enum(BULLETIN_KINDS),
  title: z.string().trim().min(1, "Title is required").max(160),
  details: z.string().trim().max(8000).default(""),
  subjectType: z.enum(BULLETIN_SUBJECT_TYPES).default("other"),
  subjectName: z.string().trim().min(1, "Subject is required").max(160),
  status: z.enum(BULLETIN_STATUSES).default("open"),
  ownerId: z.string().regex(UUID, "Choose an owner from the team list").nullable().default(null),
  nextAction: z.string().trim().max(500).default(""),
  dueDate: z
    .string()
    .regex(DATE_ONLY, "Due date must be a calendar date (YYYY-MM-DD)")
    .nullable()
    .default(null),
});

/** Normalised draft after defaults and whitespace trimming have been applied. */
export type BulletinDraft = z.output<typeof bulletinDraftInput>;
export type BulletinDraftInput = z.input<typeof bulletinDraftInput>;

export const createBulletinInput = bulletinDraftInput.extend({
  scope: z.enum(BULLETIN_SCOPES),
});

export const listBulletinsQuery = z.object({
  scope: z.enum(BULLETIN_SCOPES),
  kind: z.enum(BULLETIN_KINDS),
  status: z.enum(BULLETIN_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(BULLETIN_PAGE_SIZE),
});

export const bulletinDetailQuery = z.object({
  scope: z.enum(BULLETIN_SCOPES),
  id: z.string().regex(UUID, "id must be a bulletin_items.id"),
  updatesPage: z.coerce.number().int().min(1).default(1),
  updatesPageSize: z.coerce.number().int().min(1).max(100).default(BULLETIN_UPDATES_PAGE_SIZE),
});

export const bulletinSummaryQuery = z.object({
  scope: z.enum(BULLETIN_SCOPES),
});

/** Kind is immutable: moving work between boards would rewrite its meaning. */
export const updateBulletinInput = bulletinDraftInput.omit({ kind: true }).extend({
  scope: z.enum(BULLETIN_SCOPES),
  id: z.string().regex(UUID, "id must be a bulletin_items.id"),
  expectedVersion: z.coerce.number().int().positive(),
});

export const addBulletinUpdateInput = z.object({
  bulletinId: z.string().regex(UUID, "bulletinId must be a bulletin_items.id"),
  body: z.string().trim().min(1, "Update is required").max(4000),
});

/** Runtime boundary for rows returned from the not-yet-generated table type. */
export const bulletinItemRowSchema = z.object({
  id: z.string().regex(UUID),
  kind: z.enum(BULLETIN_KINDS),
  title: z.string(),
  details: z.string(),
  subject_type: z.enum(BULLETIN_SUBJECT_TYPES),
  subject_name: z.string(),
  status: z.enum(BULLETIN_STATUSES),
  owner_id: z.string().regex(UUID).nullable(),
  owner_name: z.string().nullable(),
  next_action: z.string(),
  due_date: z.string().regex(DATE_ONLY).nullable(),
  // The canonical link may be nulled if an account is removed; the display
  // snapshot remains available.
  created_by: z.string().regex(UUID).nullable(),
  created_by_name: z.string(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  last_update_at: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
});
export type BulletinItemRow = z.infer<typeof bulletinItemRowSchema>;

export const bulletinUpdateRowSchema = z.object({
  id: z.string().regex(UUID),
  bulletin_id: z.string().regex(UUID),
  // The append remains after account removal, alongside author_name.
  author_id: z.string().regex(UUID).nullable(),
  author_name: z.string(),
  body: z.string(),
  created_at: z.string().datetime({ offset: true }),
});
export type BulletinUpdateRow = z.infer<typeof bulletinUpdateRowSchema>;

export interface BulletinItem {
  id: string;
  kind: BulletinKind;
  title: string;
  details: string;
  subjectType: BulletinSubjectType;
  subjectName: string;
  status: BulletinStatus;
  ownerId: string | null;
  ownerName: string | null;
  nextAction: string;
  /** Calendar date (YYYY-MM-DD), not a timestamp. */
  dueDate: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  lastUpdateAt: string;
  /** Used for optimistic manager edits. */
  version: number;
}

export interface BulletinUpdate {
  id: string;
  bulletinId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface BulletinOwner {
  id: string;
  name: string;
  isManager: boolean;
}

export interface BulletinListPage {
  rows: BulletinItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  canManage: boolean;
}

export interface BulletinDetail {
  item: BulletinItem;
  updates: BulletinUpdate[];
  updatesTotal: number;
  updatesPage: number;
  updatesPageSize: number;
  updatesPageCount: number;
  canManage: boolean;
}

export interface BulletinBoardSummary {
  kind: BulletinKind;
  total: number;
  open: number;
  blocked: number;
}

export interface BulletinSummary {
  boards: BulletinBoardSummary[];
  attention: {
    overdue: number;
    dueSoon: number;
    unassigned: number;
  };
  /** Europe/London calendar date used for the attention counts. */
  asOfDate: string;
  dueSoonThrough: string;
  canManage: boolean;
}

export function mapBulletinItemRow(input: unknown): BulletinItem {
  const row = bulletinItemRowSchema.parse(input);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    details: row.details,
    subjectType: row.subject_type,
    subjectName: row.subject_name,
    status: row.status,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    nextAction: row.next_action,
    dueDate: row.due_date,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdateAt: row.last_update_at,
    version: row.version,
  };
}

export function mapBulletinUpdateRow(input: unknown): BulletinUpdate {
  const row = bulletinUpdateRowSchema.parse(input);
  return {
    id: row.id,
    bulletinId: row.bulletin_id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  };
}
