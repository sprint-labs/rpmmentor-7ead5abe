# Fixture-aware Match Report form

## Current state

`ReportForm` in `src/components/workflows.tsx` uses `goalkeepers` from `src/lib/mock-data.ts` for the goalkeeper datalist. `team`, `opponent`, `competition`, `matchDate` are free-text; nothing reacts when the mentor picks a keeper. Roster data (club, league, parent club, loan status) lives only in `mock-data.ts` — Supabase has no `players`/`fixtures` tables yet.

## Phase 1 — Auto-fill club from Supabase (immediate)

### Data model
- New `public.players` table as roster source of truth:
  - `id uuid pk`, `full_name text`, `current_club text`, `parent_club text nullable`, `on_loan bool`, `league text`, `nationality text`, `tier text`, `instagram_handle text nullable`, timestamps.
  - `UNIQUE (lower(full_name))` for name-based lookup (keeper picker is a name string today).
- Grants: `SELECT` to `authenticated`; write to `service_role` + super_admin via policy. RLS on.
- Seed via migration from the current `mock-data.ts` roster (one-off).

### Server
- `src/lib/players.functions.ts`:
  - `listPlayers()` — id, full_name, current_club, league, tier. `requireSupabaseAuth`, cached in TanStack Query.
  - `getPlayerByName(name)` — case-insensitive lookup, returns club/league/tier or null.

### UI (`ReportForm`)
- Replace `goalkeepers` import with a `useQuery(['players'], listPlayers)` roster.
- On goalkeeper change:
  - Look up the player row.
  - If found AND the `team` field is empty OR still equal to the previously auto-filled value, set `team = current_club`.
  - Track `autoFilledTeam` in a ref so a mentor's manual edit is never overwritten by a later re-selection.
  - Show a subtle "Auto-filled from roster · Edit" hint under the Team field; clicking it clears the auto-fill lock.
- Keep the input free-text and editable (loan clubs, trials, mid-transfer cases).
- Draft store: no schema change; `team` already persists.

### Assumptions / gaps
- Keeper selection is still by **name** (datalist), not id. Name-based join is fine short-term but will drift on renames/duplicates; migrating the form to store `player_id` is a follow-up.
- Mock roster becomes seed-only; the goalkeeper profile page still reads mock data and should switch to `listPlayers` in a later pass.

## Phase 2 — Fixture-aware suggestions (design only, not built)

### Data model
```text
public.fixtures
  id uuid pk
  player_id uuid fk -> players(id)      -- keeper the fixture is for
  team text not null                     -- keeper's side, denormalised (loan/national team)
  opponent text not null
  competition text nullable              -- may be unknown at import time
  kickoff_at timestamptz not null
  venue text nullable
  source text not null                   -- 'manual' | 'import:<provider>' | 'ingest:<sheet>'
  external_id text nullable              -- provider fixture id for idempotent upsert
  status text not null default 'scheduled'  -- scheduled | played | postponed | cancelled
  created_at, updated_at
  UNIQUE (player_id, kickoff_at, opponent)
  UNIQUE (source, external_id) where external_id is not null
```
- Index `(player_id, kickoff_at desc)` for the picker.
- RLS: `SELECT` to authenticated; writes to service_role + admin.
- Optional `public.fixture_imports` audit table (provider, batch, counts) for the integrations page.

### Server
- `listFixturesForPlayer(playerId, { window: '±30d' })` — returns candidate fixtures ordered by proximity to today, played or scheduled.
- `getFixture(id)` — hydrate on selection.
- Ingest job (later): TanStack server route under `src/routes/api/public/fixtures/ingest` for provider webhooks, or a scheduled pull; both idempotent via `(source, external_id)`.

### UI behaviour
When the mentor picks a goalkeeper:
1. Fetch fixtures in a ±30-day window.
2. Render a **"Link a fixture"** combobox above Team/Opponent/Date, plus a "No fixture yet — enter manually" escape.
3. On fixture select, auto-fill `team`, `opponent`, `competition`, `matchDate`.
   - Each field individually retains the same "auto-filled / edit to override" pattern as Phase 1.
   - **Competition is always editable** (cup rounds, friendlies, unknown at fixture-import time).
4. Persist `fixture_id` on the submitted report (new nullable column on `match_reports_cache`/report row); mentors can also submit with `fixture_id = null` for matches not yet in the fixture list.
5. Reverse link: goalkeeper profile can show "Reports linked to this fixture" once both exist.

### Conflict / edge cases
- Two fixtures on the same day (double-header, national team + club): combobox shows both with kickoff + competition.
- Fixture is later updated (opponent/date change): show a "Fixture updated since draft" banner in the draft-conflict UI; mentor chooses to keep entered values or refresh from fixture.
- Fixture deleted after report submission: report keeps its snapshot (team/opponent/date persisted on the report row), `fixture_id` set to null via `ON DELETE SET NULL`.

### Assumptions / gaps
- No fixture provider decided yet (Opta, SofaScore, manual CSV, or piggy-back on the existing Google Sheets connector). The `source`/`external_id` design is provider-agnostic.
- Assumes fixtures are player-scoped, not club-scoped. A club-scoped model (`fixtures` keyed by club, joined via `players.current_club`) is simpler to import but breaks for loan/national/trial scenarios — recommend keeping player-scoped and letting ingest fan out per squad.
- No handling here for opponent-goalkeeper metadata (their #1, their form) — out of scope.
- Report schema currently lives partly in Google Sheets; adding `fixture_id` presumes the Supabase migration for `match_reports` (previously proposed) lands first, otherwise `fixture_id` has to be stored in `match_reports_cache` only and won't round-trip through Sheets.

## Rollout order
1. Ship Phase 1 (players table + auto-fill). Low risk, unblocks club consistency.
2. Migrate the goalkeeper profile + roster page reads to `listPlayers` (removes mock coupling).
3. Land the Match Reports Supabase migration (previously scoped).
4. Add `fixtures` table + manual admin CRUD; wire the combobox behind a feature flag.
5. Add the first automated fixture ingest.
