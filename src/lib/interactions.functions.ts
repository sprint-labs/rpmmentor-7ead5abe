/**
 * Durable interaction logging server functions.
 *
 * Both functions require an authenticated Supabase session. Mentor identity
 * is ALWAYS derived from `context.userId` (which equals `profiles.id`, itself
 * FK-bound to `auth.users.id`) and never read from client input.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createInteractionInput,
  listInteractionsQuery,
  type InteractionsPage,
  type LoggedInteraction,
} from "@/lib/interactions/schema";
import { mapInteractionRow } from "@/lib/interactions/map";

export const listInteractions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoggedInteraction[]> => {
    const { data, error } = await context.supabase
      .from("interactions")
      .select(
        "id, gk_slug, goalkeeper_name, player_id, mentor_id, mentor_name, interaction_type, club, occurred_at, notes, outcome, follow_up, created_at",
      )
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapInteractionRow);
  });

export const createInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createInteractionInput.parse(data))
  .handler(async ({ data, context }): Promise<LoggedInteraction> => {
    const { supabase, userId } = context;

    // Mentor identity: derived server-side, never client-supplied.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) {
      throw new Error("No mentor profile found for the signed-in user.");
    }

    // Roster link: ONLY a submitted canonical players.id, re-confirmed to
    // exist. No name matching of any kind — an unmatched selection saves null
    // rather than blocking an otherwise valid interaction.
    let playerId: string | null = null;
    if (data.playerId) {
      const { data: player } = await supabase
        .from("players")
        .select("id")
        .eq("id", data.playerId)
        .maybeSingle();
      playerId = player?.id ?? null;
    }

    const { data: inserted, error } = await supabase
      .from("interactions")
      .insert({
        mentor_id: userId,
        mentor_name: profile.name || profile.email || "",
        player_id: playerId,
        goalkeeper_name: data.goalkeeperName,
        gk_slug: data.gkSlug ?? "",
        interaction_type: data.interactionType,
        club: data.club ?? "",
        occurred_at: data.occurredAt,
        notes: data.notes,
        outcome: data.outcome ?? "",
        follow_up: data.followUp ?? "",
      })
      .select(
        "id, gk_slug, goalkeeper_name, player_id, mentor_id, mentor_name, interaction_type, club, occurred_at, notes, outcome, follow_up, created_at",
      )
      .single();

    // Read-back is mandatory: no inserted row means no success.
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error("The interaction could not be confirmed as saved.");
    return mapInteractionRow(inserted);
  });

/**
 * Paged, server-filtered interactions log.
 *
 * Every filter is applied in Postgres and only one page of rows crosses the
 * wire, so the log stays fast regardless of how many interactions exist.
 * RLS still scopes what the signed-in user may read.
 */
export const listInteractionsPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listInteractionsQuery.parse(data))
  .handler(async ({ data, context }): Promise<InteractionsPage> => {
    const pageSize = data.pageSize;
    const page = data.page;
    const fromRow = (page - 1) * pageSize;

    const columns =
      "id, gk_slug, goalkeeper_name, player_id, mentor_id, mentor_name, interaction_type, club, occurred_at, notes, outcome, follow_up, created_at";

    let query = context.supabase
      .from("interactions")
      .select(columns, { count: "exact" });

    if (data.from) query = query.gte("occurred_at", data.from);
    if (data.to) query = query.lte("occurred_at", data.to);
    if (data.mentorId) query = query.eq("mentor_id", data.mentorId);
    else if (data.mentorName) query = query.eq("mentor_name", data.mentorName);
    if (data.interactionType) query = query.eq("interaction_type", data.interactionType);
    if (data.search) {
      const term = data.search.replace(/[%,()]/g, " ").trim();
      if (term) {
        query = query.or(`goalkeeper_name.ilike.%${term}%,club.ilike.%${term}%`);
      }
    }

    const { data: rows, error, count } = await query
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(fromRow, fromRow + pageSize - 1);

    if (error) throw new Error(error.message);
    const total = count ?? 0;
    return {
      rows: (rows ?? []).map(mapInteractionRow),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  });
