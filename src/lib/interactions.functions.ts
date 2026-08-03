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

    // Roster link: resolved server-side by name, not trusted from the client.
    const { data: player } = await supabase
      .from("players")
      .select("id, full_name")
      .ilike("full_name", data.goalkeeperName)
      .maybeSingle();

    const { data: inserted, error } = await supabase
      .from("interactions")
      .insert({
        mentor_id: userId,
        mentor_name: profile.name || profile.email || "",
        player_id: player?.id ?? null,
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
