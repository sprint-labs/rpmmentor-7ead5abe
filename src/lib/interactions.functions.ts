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
  attachInteractionAudioInput,
  createInteractionInput,
  interactionTypeForEdit,
  isLoggableInteractionType,
  listInteractionAudioQuery,
  listInteractionsQuery,
  updateInteractionInput,
  MATCH_REPORT_INTERACTION_TYPE,
  type InteractionAudioClip,
  type InteractionAudioLink,
  type InteractionsPage,
  type LoggedInteraction,
} from "@/lib/interactions/schema";

import { INTERACTION_COLUMNS, mapInteractionRow } from "@/lib/interactions/map";
import { linkInteractionAudio } from "@/lib/interactions/audio-link";
import { getUserRoles, hasAnyRole, INTERACTION_MANAGE_ROLES } from "@/lib/roles.server";
import { MEDIA_BUCKET } from "@/lib/storage/bucket";

export const listInteractions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoggedInteraction[]> => {
    const { data, error } = await context.supabase
      .from("interactions")
      .select(INTERACTION_COLUMNS)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapInteractionRow);
  });

export const createInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createInteractionInput.parse(data))
  .handler(async ({ data, context }): Promise<LoggedInteraction> => {
    const { supabase, userId } = context;

    // Defence in depth behind the validator: a manually logged interaction can
    // never be a Match Report observation, so it can never inflate the counts.
    let interactionType = data.interactionType;
    if (!isLoggableInteractionType(interactionType)) {
      throw new Error(
        `"${MATCH_REPORT_INTERACTION_TYPE}" is recorded by submitting a Match Report, not by logging an interaction.`,
      );
    }



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

    // When this interaction is the write-up for a scheduled event, the event is
    // confirmed first: it must exist, still be going ahead, expect an
    // interaction, and belong to this mentor or to somebody entitled to answer
    // for it. A rejected link fails the save rather than storing an unlinked
    // interaction that would leave the requirement quietly outstanding.
    let calendarEventId: string | null = null;
    if (data.calendarEventId) {
      const { verifyFollowUpTarget } = await import("@/lib/events/link-follow-up.server");
      const target = await verifyFollowUpTarget(
        supabase,
        userId,
        data.calendarEventId,
        "interaction",
      );
      calendarEventId = target.eventId;
      // The event decides which goalkeeper this is about.
      playerId = target.playerId ?? playerId;
      // It also decides which interaction category discharges the requirement.
      // This prevents, for example, a Training Ground Visit from completing a
      // Coffee Catch-up event simply because both use the interaction form.
      interactionType = target.interactionType ?? interactionType;
    }

    const { data: inserted, error } = await supabase
      .from("interactions")
      .insert({
        mentor_id: userId,
        mentor_name: profile.name || profile.email || "",
        player_id: playerId,
        goalkeeper_name: data.goalkeeperName,
        gk_slug: data.gkSlug ?? "",
        interaction_type: interactionType,
        club: data.club ?? "",
        occurred_at: data.occurredAt,
        notes: data.notes,
        outcome: data.outcome ?? "",
        follow_up: data.followUp ?? "",
        calendar_event_id: calendarEventId,
      })
      .select(INTERACTION_COLUMNS)
      .single();

    // Read-back is mandatory: no inserted row means no success.
    if (error) {
      const { isDuplicateFollowUp, DUPLICATE_FOLLOW_UP_MESSAGE } = await import(
        "@/lib/events/link-follow-up.server"
      );
      if (calendarEventId && isDuplicateFollowUp(error)) {
        throw new Error(DUPLICATE_FOLLOW_UP_MESSAGE);
      }
      throw new Error(error.message);
    }
    if (!inserted) throw new Error("The interaction could not be confirmed as saved.");
    return mapInteractionRow(inserted);
  });

/**
 * Correct an existing interaction in place.
 *
 * The ORIGINAL row is updated — no replacement row is ever created. Authorship,
 * creation time and the Match Report link are immutable (enforced by a database
 * trigger), so an edit can only ever change the descriptive fields.
 *
 * Authorisation is checked twice: here against `user_roles`, and again by the
 * `interactions_update_authorised` RLS policy. The server check exists to give a
 * clear message; RLS is what actually protects the row.
 */
export const updateInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => updateInteractionInput.parse(data))
  .handler(async ({ data, context }): Promise<LoggedInteraction> => {
    const { supabase, userId } = context;

    const { data: existing, error: loadError } = await supabase
      .from("interactions")
      .select("id, mentor_id, interaction_type, calendar_event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!existing) throw new Error("That interaction no longer exists.");

    // A Match-Report-generated observation keeps its type for ever: it can be
    // corrected in place but never reclassified (which would hide it from the
    // report-linked activity), and a manual entry can never become one.
    const wasMatchReportObservation = existing.interaction_type === MATCH_REPORT_INTERACTION_TYPE;
    const interactionType = interactionTypeForEdit(
      existing.interaction_type,
      existing.calendar_event_id,
      data.interactionType,
    );
    if (
      !wasMatchReportObservation &&
      !existing.calendar_event_id &&
      !isLoggableInteractionType(interactionType)
    ) {
      throw new Error(
        `"${MATCH_REPORT_INTERACTION_TYPE}" is recorded by submitting a Match Report, not by logging an interaction.`,
      );
    }

    const roles = await getUserRoles(supabase, userId);
    const isAuthor = existing.mentor_id === userId;
    if (!isAuthor && !hasAnyRole(roles, INTERACTION_MANAGE_ROLES)) {
      throw new Error("You do not have permission to edit this interaction.");
    }

    // Re-confirm the roster link rather than trusting the submitted id.
    let playerId: string | null = null;
    if (data.playerId) {
      const { data: player } = await supabase
        .from("players")
        .select("id")
        .eq("id", data.playerId)
        .maybeSingle();
      playerId = player?.id ?? null;
    }

    const { data: updated, error } = await supabase
      .from("interactions")
      .update({
        player_id: playerId,
        goalkeeper_name: data.goalkeeperName,
        gk_slug: data.gkSlug ?? "",
        interaction_type: interactionType,
        club: data.club ?? "",
        occurred_at: data.occurredAt,
        notes: data.notes,
        outcome: data.outcome ?? "",
        follow_up: data.followUp ?? "",
        updated_by: userId,
      })
      .eq("id", data.id)
      .select(INTERACTION_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    // A zero-row update means RLS refused it. Never report success unconfirmed.
    if (!updated) throw new Error("The change could not be confirmed as saved.");

    // Explicit read-back against the stored row, so the confirmation the user
    // sees reflects what is actually in the database.
    const { data: readback, error: readbackError } = await supabase
      .from("interactions")
      .select(INTERACTION_COLUMNS)
      .eq("id", data.id)
      .single();
    if (readbackError) throw new Error(readbackError.message);
    if (!readback) throw new Error("The change could not be confirmed as saved.");

    const confirmed = mapInteractionRow(readback);
    if (
      confirmed.occurredAt !== data.occurredAt ||
      confirmed.notes !== data.notes ||
      confirmed.interactionType !== interactionType
    ) {
      throw new Error("The saved interaction did not match what was submitted.");
    }
    return confirmed;
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
  .validator((data) => listInteractionsQuery.parse(data))
  .handler(async ({ data, context }): Promise<InteractionsPage> => {
    const pageSize = data.pageSize;
    const page = data.page;
    const fromRow = (page - 1) * pageSize;

    let query = context.supabase
      .from("interactions")
      .select(INTERACTION_COLUMNS, { count: "exact" });

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

    const {
      data: rows,
      error,
      count,
    } = await query
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

/**
 * Attach an uploaded voice recording to an interaction.
 *
 * Called only after the interaction itself has been confirmed saved, so a
 * failure here can never leave a media record pointing at nothing. Repeating
 * the call with the same media asset returns the existing link rather than
 * creating a second one.
 */
export const attachInteractionAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => attachInteractionAudioInput.parse(data))
  .handler(async ({ data, context }): Promise<InteractionAudioLink> => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    return linkInteractionAudio(supabase, {
      interactionId: data.interactionId,
      mediaId: data.mediaId,
      userId,
      canManageAny: hasAnyRole(roles, INTERACTION_MANAGE_ROLES),
    });
  });

/**
 * Persisted recordings for a set of interactions, with short-lived playback
 * URLs. RLS scopes the rows; a clip is only returned for an interaction the
 * caller is allowed to read.
 */
export const listInteractionAudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => listInteractionAudioQuery.parse(data))
  .handler(async ({ data, context }): Promise<InteractionAudioClip[]> => {
    if (data.interactionIds.length === 0) return [];

    const { data: rows, error } = await context.supabase
      .from("interaction_media")
      .select(
        "interaction_id, media_id, created_at, media_assets:media_id(title, file_path, mime_type, file_size)",
      )
      .in("interaction_id", data.interactionIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    type AssetRow = {
      title: string;
      file_path: string;
      mime_type: string | null;
      file_size: number | null;
    };
    const clips = (rows ?? [])
      .map((row) => {
        const asset = row.media_assets as AssetRow | null;
        if (!asset?.file_path) return null;
        return {
          interactionId: row.interaction_id,
          mediaId: row.media_id,
          title: asset.title,
          filePath: asset.file_path,
          mimeType: asset.mime_type,
          fileSize: asset.file_size,
          createdAt: row.created_at,
          signedUrl: null as string | null,
        };
      })
      .filter((clip): clip is InteractionAudioClip => clip !== null);
    if (clips.length === 0) return [];

    // One batch call rather than one round trip per clip.
    const { data: signed } = await context.supabase.storage.from(MEDIA_BUCKET).createSignedUrls(
      clips.map((c) => c.filePath),
      3600,
    );
    const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? null]));
    // A missing URL is reported as null rather than hidden — the clip still
    // exists, it just could not be signed on this request.
    return clips.map((clip) => ({ ...clip, signedUrl: urlByPath.get(clip.filePath) ?? null }));
  });
