/**
 * Authenticated data boundary for the internal Bulletin Board.
 *
 * RLS is the final backstop, but every function also checks the caller's stored
 * role and applies the same own-or-created scope for mentors. Management roles
 * may manage the team board; mentors may create their own work and append
 * updates to work they own or created. There is deliberately no delete path.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  addBulletinUpdateInput,
  bulletinDetailQuery,
  bulletinSummaryQuery,
  BULLETIN_KINDS,
  createBulletinInput,
  listBulletinsQuery,
  mapBulletinItemRow,
  mapBulletinUpdateRow,
  updateBulletinInput,
  type BulletinDetail,
  type BulletinDraft,
  type BulletinItem,
  type BulletinKind,
  type BulletinListPage,
  type BulletinOwner,
  type BulletinStatus,
  type BulletinScope,
  type BulletinSummary,
  type BulletinUpdate,
} from "@/lib/bulletins/schema";
import {
  bulletinAccessForRoles,
  BULLETIN_MANAGE_ROLES,
  clampBulletinCreateStatus,
  getLondonAttentionWindow,
  mineScopeCreateOwner,
  sanitiseBulletinSearch,
  type BulletinAccess,
} from "@/lib/bulletins/server-helpers";
import { getUserRoles, requireRole } from "@/lib/roles.server";

type BulletinItemDbRow = {
  id: string;
  kind: BulletinKind;
  title: string;
  details: string;
  subject_type: BulletinDraft["subjectType"];
  subject_name: string;
  status: BulletinStatus;
  owner_id: string | null;
  owner_name: string | null;
  next_action: string;
  due_date: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  last_update_at: string;
  version: number;
};

type BulletinUpdateDbRow = {
  id: string;
  bulletin_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

type BulletinDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      bulletin_items: {
        Row: BulletinItemDbRow;
        Insert: Omit<
          BulletinItemDbRow,
          "id" | "created_at" | "updated_at" | "last_update_at" | "version"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          last_update_at?: string;
          version?: number;
        };
        Update: Partial<Omit<BulletinItemDbRow, "id" | "kind" | "created_by" | "created_at">>;
        Relationships: [];
      };
      bulletin_updates: {
        Row: BulletinUpdateDbRow;
        Insert: Omit<BulletinUpdateDbRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
  };
};

type AuthedClient = SupabaseClient<Database>;
type BulletinClient = SupabaseClient<BulletinDatabase>;

/**
 * Single, reviewable escape hatch while generated Supabase types lag the new
 * forward migration. Runtime Zod parsing immediately validates every row that
 * crosses back into application code.
 */
function asBulletinClient(client: AuthedClient): BulletinClient {
  return client as unknown as BulletinClient;
}

const BULLETIN_ITEM_COLUMNS =
  "id, kind, title, details, subject_type, subject_name, status, owner_id, owner_name, next_action, due_date, created_by, created_by_name, created_at, updated_at, last_update_at, version";
const BULLETIN_UPDATE_COLUMNS = "id, bulletin_id, author_id, author_name, body, created_at";

async function requireBulletinAccess(
  client: AuthedClient,
  userId: string,
  requestedScope: BulletinScope,
): Promise<BulletinAccess> {
  const roles = await getUserRoles(client, userId);
  const access = bulletinAccessForRoles(roles, requestedScope);
  if (!access.canView) {
    throw new Error("You do not have permission to view the Bulletin Board.");
  }
  return access;
}

async function getProfileName(client: AuthedClient, userId: string): Promise<string> {
  const { data, error } = await client
    .from("profiles")
    .select("name,email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No profile was found for the signed-in account.");
  return data.name?.trim() || data.email?.trim() || "RPM team member";
}

async function resolveOwner(
  client: AuthedClient,
  userId: string,
  access: BulletinAccess,
  requestedOwnerId: string | null,
  creatorName: string,
): Promise<{ owner_id: string | null; owner_name: string | null }> {
  // Mine-scope work self-assigns only when the actor is genuinely represented
  // in the mentor directory. Admin/Super Admin preview accounts remain
  // unassigned and can still read the row through its created_by link.
  if (!access.canManage) {
    const owner = mineScopeCreateOwner(access, userId, creatorName);
    return { owner_id: owner.ownerId, owner_name: owner.ownerName };
  }
  if (!requestedOwnerId) return { owner_id: null, owner_name: null };

  const { data, error } = await client.rpc("list_mentor_directory");
  if (error) throw new Error(error.message);
  const owner = (data ?? []).find(({ id }) => id === requestedOwnerId);
  if (!owner) throw new Error("Choose an active mentor or mentor manager as the owner.");
  return { owner_id: owner.id, owner_name: owner.name?.trim() || "RPM team member" };
}

interface BulletinCountFilters {
  kind?: BulletinKind;
  status?: BulletinStatus;
  excludeClosed?: boolean;
  ownerIsNull?: boolean;
  dueBefore?: string;
  dueOnOrAfter?: string;
  dueOnOrBefore?: string;
}

async function countBulletins(
  client: BulletinClient,
  userId: string,
  access: BulletinAccess,
  filters: BulletinCountFilters,
): Promise<number> {
  let query = client.from("bulletin_items").select("id", { count: "exact", head: true });
  if (access.restrictToUser) {
    query = query.or(`created_by.eq.${userId},owner_id.eq.${userId}`);
  }
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.excludeClosed) query = query.neq("status", "closed");
  if (filters.ownerIsNull) query = query.is("owner_id", null);
  if (filters.dueBefore) query = query.lt("due_date", filters.dueBefore);
  if (filters.dueOnOrAfter) query = query.gte("due_date", filters.dueOnOrAfter);
  if (filters.dueOnOrBefore) query = query.lte("due_date", filters.dueOnOrBefore);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export const listBulletins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => listBulletinsQuery.parse(data))
  .handler(async ({ data, context }): Promise<BulletinListPage> => {
    const access = await requireBulletinAccess(context.supabase, context.userId, data.scope);
    const client = asBulletinClient(context.supabase);
    const from = (data.page - 1) * data.pageSize;

    let query = client
      .from("bulletin_items")
      .select(BULLETIN_ITEM_COLUMNS, { count: "exact" })
      .eq("kind", data.kind);
    if (access.restrictToUser) {
      query = query.or(`created_by.eq.${context.userId},owner_id.eq.${context.userId}`);
    }
    if (data.status) query = query.eq("status", data.status);
    const search = sanitiseBulletinSearch(data.search);
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,subject_name.ilike.%${search}%,next_action.ilike.%${search}%`,
      );
    }

    const {
      data: rows,
      error,
      count,
    } = await query
      .order("last_update_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    const total = count ?? 0;
    return {
      rows: (rows ?? []).map(mapBulletinItemRow),
      total,
      page: data.page,
      pageSize: data.pageSize,
      pageCount: Math.max(1, Math.ceil(total / data.pageSize)),
      canManage: access.canManage,
    };
  });

export const getBulletinDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => bulletinDetailQuery.parse(data))
  .handler(async ({ data, context }): Promise<BulletinDetail> => {
    const access = await requireBulletinAccess(context.supabase, context.userId, data.scope);
    const client = asBulletinClient(context.supabase);

    let itemQuery = client.from("bulletin_items").select(BULLETIN_ITEM_COLUMNS).eq("id", data.id);
    if (access.restrictToUser) {
      itemQuery = itemQuery.or(`created_by.eq.${context.userId},owner_id.eq.${context.userId}`);
    }
    const { data: itemRow, error: itemError } = await itemQuery.maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!itemRow) throw new Error("That Bulletin Board item was not found.");

    const updatesFrom = (data.updatesPage - 1) * data.updatesPageSize;
    const {
      data: updateRows,
      error: updatesError,
      count: updatesTotal,
    } = await client
      .from("bulletin_updates")
      .select(BULLETIN_UPDATE_COLUMNS, { count: "exact" })
      .eq("bulletin_id", data.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(updatesFrom, updatesFrom + data.updatesPageSize - 1);
    if (updatesError) throw new Error(updatesError.message);
    const total = updatesTotal ?? 0;
    return {
      item: mapBulletinItemRow(itemRow),
      updates: (updateRows ?? []).map(mapBulletinUpdateRow),
      updatesTotal: total,
      updatesPage: data.updatesPage,
      updatesPageSize: data.updatesPageSize,
      updatesPageCount: Math.max(1, Math.ceil(total / data.updatesPageSize)),
      canManage: access.canManage,
    };
  });

export const getBulletinSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => bulletinSummaryQuery.parse(data))
  .handler(async ({ data, context }): Promise<BulletinSummary> => {
    const access = await requireBulletinAccess(context.supabase, context.userId, data.scope);
    const client = asBulletinClient(context.supabase);
    const { today, dueSoonThrough } = getLondonAttentionWindow();

    const [boards, overdue, dueSoon, unassigned] = await Promise.all([
      Promise.all(
        BULLETIN_KINDS.map(async (kind) => {
          const [total, open, blocked] = await Promise.all([
            countBulletins(client, context.userId, access, { kind }),
            countBulletins(client, context.userId, access, { kind, status: "open" }),
            countBulletins(client, context.userId, access, { kind, status: "blocked" }),
          ]);
          return { kind, total, open, blocked };
        }),
      ),
      countBulletins(client, context.userId, access, {
        excludeClosed: true,
        dueBefore: today,
      }),
      countBulletins(client, context.userId, access, {
        excludeClosed: true,
        dueOnOrAfter: today,
        dueOnOrBefore: dueSoonThrough,
      }),
      countBulletins(client, context.userId, access, {
        excludeClosed: true,
        ownerIsNull: true,
      }),
    ]);

    return {
      boards,
      attention: { overdue, dueSoon, unassigned },
      asOfDate: today,
      dueSoonThrough,
      canManage: access.canManage,
    };
  });

export const listBulletinOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: BulletinOwner[] }> => {
    await requireRole(
      context.supabase,
      context.userId,
      BULLETIN_MANAGE_ROLES,
      "assign Bulletin Board work",
    );
    const { data, error } = await context.supabase.rpc("list_mentor_directory");
    if (error) throw new Error(error.message);
    const rows = (data ?? [])
      .map((owner) => ({
        id: owner.id,
        name: owner.name?.trim() || "RPM team member",
        isManager: Boolean(owner.is_manager),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    return { rows };
  });

export const createBulletin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createBulletinInput.parse(data))
  .handler(async ({ data, context }): Promise<BulletinItem> => {
    const access = await requireBulletinAccess(context.supabase, context.userId, data.scope);
    const creatorName = await getProfileName(context.supabase, context.userId);
    const owner = await resolveOwner(
      context.supabase,
      context.userId,
      access,
      data.ownerId,
      creatorName,
    );

    const { data: row, error } = await asBulletinClient(context.supabase)
      .from("bulletin_items")
      .insert({
        kind: data.kind,
        title: data.title,
        details: data.details,
        subject_type: data.subjectType,
        subject_name: data.subjectName,
        // Every mine-scope preview opens work. Only a real team-management
        // create may deliberately start in another status.
        status: clampBulletinCreateStatus(access, data.status),
        ...owner,
        next_action: data.nextAction,
        due_date: data.dueDate,
        created_by: context.userId,
        created_by_name: creatorName,
      })
      .select(BULLETIN_ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("The Bulletin Board item could not be confirmed as saved.");
    return mapBulletinItemRow(row);
  });

export const updateBulletin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => updateBulletinInput.parse(data))
  .handler(async ({ data, context }): Promise<BulletinItem> => {
    const access = await requireBulletinAccess(context.supabase, context.userId, data.scope);
    if (!access.canManage) {
      throw new Error("Team scope is required to manage Bulletin Board work.");
    }
    const editorName = await getProfileName(context.supabase, context.userId);
    const owner = await resolveOwner(
      context.supabase,
      context.userId,
      access,
      data.ownerId,
      editorName,
    );
    const client = asBulletinClient(context.supabase);
    const { id, expectedVersion } = data;

    // The version predicate makes this one atomic compare-and-swap. If another
    // manager (or a newly appended update) changed the item, the stale edit is
    // rejected instead of silently overwriting it.
    const { data: row, error } = await client
      .from("bulletin_items")
      .update({
        title: data.title,
        details: data.details,
        subject_type: data.subjectType,
        subject_name: data.subjectName,
        status: data.status,
        // owner_name is deliberately not client-updatable; the database
        // trigger derives or clears its snapshot from this canonical UUID.
        owner_id: owner.owner_id,
        next_action: data.nextAction,
        due_date: data.dueDate,
        version: expectedVersion + 1,
      })
      .eq("id", id)
      .eq("version", expectedVersion)
      .select(BULLETIN_ITEM_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      const { data: current, error: currentError } = await client
        .from("bulletin_items")
        .select("id,version")
        .eq("id", id)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (!current) throw new Error("That Bulletin Board item was not found.");
      throw new Error("This item changed since you opened it. Refresh it before saving again.");
    }
    return mapBulletinItemRow(row);
  });

export const addBulletinUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => addBulletinUpdateInput.parse(data))
  .handler(async ({ data, context }): Promise<BulletinUpdate> => {
    // Appending does not expose a view selector. Preserve the durable access
    // rule: managers may append team-wide; everyone else is clamped to mine.
    const access = await requireBulletinAccess(context.supabase, context.userId, "team");
    const client = asBulletinClient(context.supabase);

    // Confirm the parent is inside the same server-side scope before writing.
    let parentQuery = client.from("bulletin_items").select("id").eq("id", data.bulletinId);
    if (access.restrictToUser) {
      parentQuery = parentQuery.or(`created_by.eq.${context.userId},owner_id.eq.${context.userId}`);
    }
    const { data: parent, error: parentError } = await parentQuery.maybeSingle();
    if (parentError) throw new Error(parentError.message);
    if (!parent) throw new Error("That Bulletin Board item was not found.");

    const authorName = await getProfileName(context.supabase, context.userId);
    const { data: row, error } = await client
      .from("bulletin_updates")
      .insert({
        bulletin_id: data.bulletinId,
        author_id: context.userId,
        author_name: authorName,
        body: data.body,
      })
      .select(BULLETIN_UPDATE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("The update could not be confirmed as saved.");
    return mapBulletinUpdateRow(row);
  });
