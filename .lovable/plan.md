# Read-only database audit: interaction storage

## Finding: no interaction storage exists

The database has exactly 11 tables, none of which store interactions:

| Table | Rows |
|---|---|
| dashboard_click_events | 38 |
| install_prompt_events | 3 |
| match_report_submissions | 11 |
| match_reports_cache | 106 |
| media_assets | 10 |
| media_audit_log | 23 |
| password_change_audit | 2 |
| players | 113 |
| profiles | 10 |
| report_attachments | 7 |
| user_roles | 11 |

There is no `interactions`, `mentor_interactions`, `touchpoints`, or similarly named table. Therefore: no columns, no foreign keys, no row count, and no RLS policies to report for interactions. `dashboard_click_events` is UI telemetry only (source/destination/period), not a mentor interaction record.

## What exists in source instead

- `src/lib/mentor-session-store.ts` — in-memory arrays for the current tab only. `insertMentorInteraction()`, `getSessionInteractions()`, and the whitelist `ALLOWED_INTERACTION_TYPES` (Live Match Observation, Training Ground Visit, Coffee Catch Up, Phone Call). Its own header comment says a future migration should swap these arrays for inserts into `mentor_interactions`.
- `src/lib/mentor-domain.ts` — `MentorInteractionRow` interface: `id`, `player_id`, `mentor_profile_id`, `interaction_type`, `occurred_at`, `notes`, `outcome`, `follow_up`, plus optional `wellbeing_flag`, `follow_up_required`, `next_action`, `transcript_source`. Also `selectRecentInteractions()`.
- `src/lib/mock-data.ts` line 473 — `export const interactions: Interaction[] = []` (deliberately empty).
- `src/routes/interactions.tsx` — reads that empty array; renders empty state.
- `src/components/workflows.tsx` lines 212-229 — `InteractionForm` is a disabled placeholder ("Entry has been disabled until logging is connected to real storage").
- No interaction server function exists. Existing `*.functions.ts` files cover account, admin-users, analytics, transcribe, install-analytics, sheets-status, match reports, mentor-dashboard, players.

## Can the authenticated mentor create and list an interaction today?

No. There is no table, no policy, and no insert path — nothing durable can be written or read. A mentor's entries would only live in browser memory until refresh.

## Smallest exact implementation to connect the form

1. **One migration** creating `public.interactions`:
   - `id uuid pk default gen_random_uuid()`, `player_id uuid not null references public.players(id) on delete cascade`, `mentor_id uuid not null references auth.users(id)`, `interaction_type text not null`, `occurred_at timestamptz not null default now()`, `notes text not null default ''`, `outcome text not null default ''`, `follow_up text not null default ''`, `follow_up_required boolean not null default false`, `wellbeing_flag text`, `created_at`/`updated_at` with the existing `set_updated_at()` trigger.
   - Type whitelist enforced by a trigger (same pattern as `match_report_submissions_status_check()`), not a CHECK constraint.
   - `GRANT SELECT, INSERT, UPDATE ON public.interactions TO authenticated; GRANT ALL TO service_role;` then enable RLS.
   - Policies: `interactions_select_privileged` (any of mentor / mentor_manager / admin / super_admin via `has_role`) since the roster is worked collaboratively; `interactions_insert_own` (`auth.uid() = mentor_id` AND has one of those roles); `interactions_update_own_or_privileged`. No delete policy.
2. **One new file** `src/lib/interactions.functions.ts` with `listInteractions` and `createInteraction`, both `.middleware([requireSupabaseAuth])`, using `context.supabase` and setting `mentor_id` from `context.userId`, with Zod validation reusing `ALLOWED_INTERACTION_TYPES`.
3. **Replace** the placeholder `InteractionForm` in `src/components/workflows.tsx` (lines 212-229) with the real form calling `createInteraction` via `useServerFn`, and point `src/routes/interactions.tsx` at a `useQuery` on `listInteractions` instead of the empty `interactions` array from `src/lib/mock-data.ts`.
4. **Optional follow-up** (not required to connect the form): repoint `selectRecentInteractions` in `src/lib/mentor-domain.ts` and the calendar/duty-of-care consumers from the session store to the new query, so the dashboard reflects saved rows.

No changes have been made.
