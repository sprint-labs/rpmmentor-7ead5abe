# Interactions — current state handover

A complete description of the Interactions feature as built, suitable to paste into another AI as context before asking for the next change.

## What it is

Mentors log touchpoints ("interactions") with goalkeepers. Interactions are durable, stored in the backend database, and feed the Interactions log, the dashboard Recent Activity card, goalkeeper profile timelines, and Duty-of-Care cadence maths.

## Data model

Table `public.interactions`:

| Column                          | Notes                                                          |
| ------------------------------- | -------------------------------------------------------------- |
| `id`                            | uuid PK                                                        |
| `mentor_id`                     | uuid, FK `profiles.id`, NOT NULL — always the signed-in user   |
| `mentor_name`                   | text snapshot                                                  |
| `player_id`                     | uuid, FK `players.id`, nullable — resolved server-side by name |
| `goalkeeper_name`               | text                                                           |
| `gk_slug`                       | text, UI roster slug (display identity only)                   |
| `interaction_type`              | text, CHECK-constrained                                        |
| `club`                          | text snapshot at time of touchpoint                            |
| `occurred_at`                   | **date** (calendar date, not a timestamp)                      |
| `notes`, `outcome`, `follow_up` | text                                                           |
| `created_at`, `updated_at`      | timestamptz, `updated_at` maintained by trigger                |

Indexes on `occurred_at DESC`, `mentor_id`, `player_id`.

Allowed interaction types (exactly four): Live Match Observation, Training Ground Visit, Coffee Catch Up, Phone Call. The first three are duty-of-care qualifying; Phone Call is not.

Outcome options: On track, Above expectation, Below expectation, Needs follow-up, Action plan agreed.

## Security

- RLS enabled. `GRANT SELECT, INSERT` to authenticated; `ALL` to service_role. No UPDATE/DELETE grants — interactions are append-only today.
- SELECT policy: any of mentor / mentor_manager / admin / super_admin (via `has_role`).
- INSERT policy: same roles **and** `mentor_id = auth.uid()`.
- Mentor identity is never accepted from the client; it is derived from `context.userId` in the server function.

## Code map

- `src/lib/interactions/schema.ts` — shared contracts: type/outcome constants, the Zod input validator, `LoggedInteraction`, and the date-only helpers (`todayDateOnly`, `formatDateOnly`, `dateOnlyToLocalMs`, `daysSinceDateOnly`). Dates are handled as `"YYYY-MM-DD"` strings and never round-tripped through `new Date(iso)`, so the day can't shift by timezone.
- `src/lib/interactions.functions.ts` — `listInteractions` (GET, auth-required, newest 500 by `occurred_at` then `created_at`) and `createInteraction` (POST, auth-required, derives mentor from session, resolves the player link by case-insensitive name, mandatory read-back of the inserted row).
- `src/lib/interactions/map.ts` — `mapInteractionRow` (DB row -> client shape) and `reconcileInteraction` (swap optimistic row for the server-confirmed row, keep optimistic values for fields the server returned empty, de-dupe by id, re-sort to match server order).
- `src/lib/interactions/use-interactions.ts` — `useHasSupabaseSession` (gates the protected query so SSR/prerender/signed-out preview never 401s), `useLoggedInteractions` (single shared React Query cache, key `["interactions","logged"]`, 30s staleTime, no retry), and `useDutySource` (projection for duty-of-care maths).
- `src/components/workflows.tsx` — `InteractionForm` inside the Log Interaction dialog.
- `src/routes/interactions.tsx` — the log page.
- Consumers: `src/routes/index.tsx` (Recent Activity, wrapped in an error boundary), `src/routes/goalkeepers.$gkId.tsx` (profile timeline), plus duty-of-care surfaces.

## Form behaviour (Log Interaction dialog)

- Fields: Goalkeeper, Interaction Type, Club (auto-populated from the selected goalkeeper, still editable), Date (defaults to today, calendar date), Notes, Outcome, Follow-up Action (max 200 chars).
- Inline validation with ARIA wiring on every required field; Submit stays disabled until the form is valid.
- While saving: fields are wrapped in a disabled fieldset and the button shows a spinner.
- Optimistic write into the shared query cache, rollback on failure, then reconciliation with the server-confirmed row and a cache invalidation.
- Success: toast plus an in-dialog summary naming type, goalkeeper and date. Failure: explicit "not saved" error, never a silent failure.
- Dialog subtitle states entries save to the backend and appear in the interactions log.

## Interactions log page (`/interactions`)

- Gated by the `interactions.view` permission; the Log Interaction button requires `interactions.log`.
- Type filter chips plus URL search params: `from`, `to`, `mentorId`, `type`, `source` (with a legacy planned-activity name mapping, e.g. "Attend Live Match" -> "Live Match Observation").
- Distinct loading, error, filtered-empty and never-logged-anything empty states. Table renders at most 80 rows.

## Test coverage

`src/lib/interactions/interactions.test.ts`, `reconcile.test.ts`, `use-interactions.test.tsx`, `src/components/workflows.interaction.test.tsx`.

## Known gaps / likely next asks

- No edit or delete path: no UPDATE/DELETE grants, policies, server functions or UI.
- `listInteractions` is capped at 500 rows with no pagination; the log page renders only the first 80 matches.
- Mentor filtering on the log page still matches against mock mentor records by name as a fallback.
- The player link is resolved by case-insensitive exact name match, so it stays null on any spelling mismatch.
- Filtering happens client-side over the whole fetched set, not in the query.
- No attachments, no voice notes and no follow-up completion tracking on interactions (those exist only for Match Reports).
