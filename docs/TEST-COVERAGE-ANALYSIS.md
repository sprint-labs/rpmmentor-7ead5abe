# Test coverage analysis and proposed improvements

**Measured on:** `claude/test-coverage-analysis-onyg8r`, based on `origin/main` @ `341690b`.
**Reproduce with:** `npm ci && npm run test:coverage` (writes `coverage/index.html`).

Coverage excludes `src/components/ui/**` (vendored shadcn primitives),
`src/routeTree.gen.ts` and `src/integrations/supabase/types.ts` (generated), so the
numbers below describe code this project actually wrote.

---

## 1. Where the suite stands today

The suite is healthy in the sense that matters most: **68 files, 501 tests, 489 passing,
0 failing, ~34s.** Nothing is red. The problem is not test quality, it is test *reach*.

| Metric | Coverage |
| --- | --- |
| Statements | **23.5%** (2148 / 9135) |
| Branches | **19.3%** (1565 / 8124) |
| Functions | **19.6%** (431 / 2200) |
| Lines | **24.6%** (1899 / 7724) |

The 12 skipped tests are the credential-gated suites in `src/lib/auth.smoke.test.ts` and
`src/lib/storage/gk-media.test.ts`. They skip unless `TEST_MENTOR_EMAIL` /
`TEST_MENTOR_PASSWORD` (and the admin pair) are set — which, in practice, means the only
tests that exercise real Supabase Auth and RLS never run for most contributors.

### By area

| Area | Files | Statements | Covered |
| --- | ---: | ---: | ---: |
| `src/lib/time` | 1 | 40 | 95.0% |
| `src/lib/interactions` | 7 | 215 | 72.6% |
| `src/lib/calendar` | 2 | 54 | 64.8% |
| `src/lib/events` | 8 | 264 | 51.1% |
| `src/lib/match-reports` | 11 | 986 | 48.1% |
| `src/lib` (root) | 48 | 1962 | 29.8% |
| `src/components` | 16 | 2677 | 18.1% |
| `src/lib/api` | 3 | 186 | 10.2% |
| `src/routes` | 29 | 2130 | **8.5%** |
| `src/lib/sync` | 1 | 84 | 4.8% |
| `src/components/mentor` | 4 | 233 | 2.6% |
| `src/lib/pwa`, `src/lib/security`, `src/lib/mcp/tools` | 4 | 68 | **0.0%** |

### The shape of the gap

There is a clear and consistent pattern, and it explains almost all of the missing 76%:

**Pure, exported helpers are well tested. Everything with an I/O boundary is not.**

`hasAnyRole`, `toTeamCalendarEvent`, `playerRecordUpdateSchema`, the match-report ledger and
identity helpers, the London-timezone helpers — these are covered properly, often with good
branch coverage. But every `createServerFn(...).handler(...)` body, every route component and
every browser-storage module sits near zero, because the logic lives inside a closure that no
test can reach.

Concretely, across the 31 `*.functions.ts` / `*.server.ts` modules:

- 16 are **below 10%** statement coverage.
- Only 3 are above 70% — `link-follow-up.server.ts` (94.7%), `store.server.ts` (74.7%) and
  `roles.server.ts` (73.7%) — and those are exactly the ones that export their logic as plain
  functions which the handler then calls. That is the pattern that works; it is just not
  applied widely.

---

## 2. Proposed improvements, in priority order

Ordered by risk × cost. The first four are the ones I would actually do first.

### P1 — Match Report submission (`ReportForm`) has zero component coverage

`src/components/workflows.tsx` is the largest file in the app (3402 lines, 23.4% covered), and
the coverage is very unevenly distributed inside it:

| Component | Statement coverage |
| --- | --- |
| `MediaForm` | 80.9% (55/68) |
| `InteractionForm` | 69.6% (257/369) |
| `GoalkeeperForm` | 7.0% (6/86) |
| `MediaAttachPicker` / `InlineUploader` | 10.3% (6/58) |
| `EditMediaForm` | 0.0% (0/44) |
| **`ReportForm`** | **0.0% (0/492)** |
| `MediaChipPreview` / `Waveform` | 0.0% (0/243) |

Submitting a Match Report is the core product workflow, and it is the single largest
untested block of behaviour in the codebase. Its supporting logic (identity, dedupe, the
ledger, the canonical store) is genuinely well tested — but the form that drives all of it,
including draft recovery, RPM-7 scoring, media attachment and duplicate confirmation, has
never been rendered in a test.

**Proposal:** add `src/components/workflows.report.test.tsx` following the existing
`workflows.interaction.test.tsx` pattern (jsdom docblock, mocked server functions, react-query
provider). It is a proven harness in this repo, so this is mostly assembly work. Target the
paths that lose user data or produce bad rows: required-field validation, draft restore on
remount, the duplicate-confirmation path, and submit failure leaving the form recoverable.

### P2 — The offline sync queue can silently discard a mentor's work

`src/lib/sync/queue.ts` is 4.8% covered with **0% branch coverage**, and it is the module
that decides whether a mentor's offline-logged interaction survives. `drainQueue` has four
distinct outcomes (processed / retried / **dropped** / needs-user-action) and none of them is
tested. `isTransient` is a regex heuristic over error messages deciding whether work is kept
or thrown away, also untested.

While reading it I noticed a likely bug that a test would have caught immediately:

```ts
function nextRetryAt(job: SyncJob): number {
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, job.attempts - 1), 5 * 60_000);
  return job.createdAt + delay;   // anchored to creation, not to the last attempt
}
```

Backoff is measured from `createdAt`, not from the most recent failure. Any job older than
its own delay window — i.e. essentially every job queued while genuinely offline — has a
retry gate already in the past, so it retries with no backoff at all and can burn through all
8 `MAX_ATTEMPTS` across a handful of back-to-back drains (each `online` event, focus and tick
triggers one), after which the job is dropped. I have **not** changed this; it needs a product
decision about intended retry behaviour. It is listed here as evidence of what the gap hides.

**Proposal:** a pure unit suite over `enqueueJob` / `drainQueue` / `removeJob` with a fake
`localStorage` and injected handlers, asserting each of the four outcomes, the backoff
schedule, and that a `NeedsUserActionError` job is never auto-dropped.

### P3 — Client/server permission drift has one test and needs a matrix

Permissions are defined twice: `MATRIX` in `src/lib/auth.tsx` (what the UI offers) and the
role constants in `src/lib/roles.server.ts` (what the server enforces, mirroring RLS). The
code comments explicitly say these must be changed together.

Exactly one pair is pinned by a test: `reports.submit` ↔ `REPORT_SUBMIT_ROLES`, in
`admin-submit-permissions.test.ts`, plus the Super Admin exclusivity check in
`roles.server.test.ts`. The other pairs — `CLUB_EDIT_ROLES` ↔ `players.edit_club`,
`INTERACTION_MANAGE_ROLES` ↔ `interactions.manage`, `REPORT_MANAGE_ROLES` ↔ `reports.manage`,
`CALENDAR_MANAGE_ROLES` ↔ `calendar.manage`, `EXECUTIVE_DASHBOARD_ROLES` ↔ `executive.view` —
have nothing holding them in step. `requireRole` and `getUserRoles` themselves are uncovered
(`roles.server.ts` is at 33% branch coverage).

I checked the current pairs by hand and found no live drift. But I did find one asymmetry
worth a product decision rather than a test: `admin` is **not** granted `media.upload`, while
`mentor` and `super_admin` both are — so `MediaForm` (`workflows.tsx:2584`) hides the bulk
upload form from admins, even though admins do hold `media.edit`. That may be deliberate; a
matrix test would at least make it a visible, asserted choice.

**Proposal:** a `permission-matrix.test.ts` that asserts the full role × permission grid as
explicit data, plus one assertion per client/server pair. Cheap, fast, and it turns every
future permission edit into a deliberate act. Add unit tests for `requireRole` against a fake
Supabase client (allowed role, wrong role, empty roles, query error).

### P4 — Server-function handler bodies are structurally untestable

This is the root cause of the low `src/lib` numbers, so it is worth naming as its own item
rather than as a list of files.

`createInteraction` (`interactions.functions.ts:60`) is representative: ~90 lines of real
policy inside a `.handler()` closure — the "a Match Report observation can never be logged
manually" guard, mentor identity derived server-side, roster linking that must never
name-match, calendar-event verification that overrides the submitted interaction type, and
mandatory insert read-back. None of it is reachable from a test. The same shape repeats in
`reports.functions.ts` (2.9%), `admin-users.functions.ts` (8.0%), `backfill.functions.ts`
(0.9%) and `transcribe.functions.ts` (8.4%).

**Proposal:** adopt the pattern this repo already uses successfully in
`match-reports/store.server.ts` (74.7%) — extract each handler body into an exported
`async function doX(supabase, userId, data)` and let `.handler()` be a one-line adapter. Then
test it with the fake PostgREST client already written in `match-reports/store.test.ts`. This
is refactor-then-test, so do it opportunistically: highest value on `interactions.functions.ts`
and `reports.functions.ts` (write paths, permission checks, data loss), lowest on the
read-only listing functions.

### P5 — Browser-storage modules that guard against data loss

Three untested modules whose only job is not losing a user's work:

- `match-reports/draft-store.ts` (2.9%) — optimistic-version save with cross-tab conflict
  detection, an "overwrite / keep mine" resolution path, and a quota-exhausted branch. Pure
  and synchronous; needs only a fake `localStorage`.
- `media-store.ts` (7.1%) — includes `canEditAsset` / `canDeleteAsset`, two pure permission
  predicates branching on role and asset ownership, both entirely uncovered.
- `mentor-session-store.ts` (0%) — the `ALLOWED_INTERACTION_TYPES` whitelist described in its
  own comment as the validation boundary for "any code path" is not asserted anywhere.

These are the cheapest wins in the whole list: pure functions, no rendering, no network.

### P6 — Route components: 8.5% across 29 routes

`src/test/goalkeepers-page.test.tsx` already demonstrates a working route harness (memory
history + `routeTree.gen` + mocked `useAuth`). It is applied to exactly one of 29 routes.
`calendar.tsx` (944 lines, 2.1%), `system.users.tsx` (996 lines, 3.1%) and
`goalkeepers.$gkId.tsx` (611 lines, 1.3%) are the biggest untested surfaces.

**Proposal:** do not chase route coverage broadly — it is slow to write and slow to run.
Instead extend the existing harness to the two or three routes where the *route itself*
enforces something: role-gated rendering on `system.users.tsx` and `executive.tsx`, and the
event create/edit permission gate on `calendar.tsx`. Leave presentational routes alone.

### P7 — Zero-coverage utility modules

Small and quick, worth a batch: `roster-quality.ts` (5.4%, pure — `parseContractDate`,
`checkGoalkeeper`, `scoreIssues`, `summarise` are all directly testable and it is 330 lines),
`mentor-domain.ts` (0%, 12 exported selectors over mock data), `notifications.tsx` (0%),
`pwa/register-sw.ts` (0%), `security/password-audit.server.ts` (0%, and it swallows every
error by design — worth pinning that it never throws into the password-change path), and
`lib/mcp/tools/*` (0%).

---

## 3. Process gaps behind the numbers

Two things would do more for coverage than any single test file:

1. **There is no CI.** No `.github/workflows` directory exists, so `npm test` runs only when
   a contributor remembers to run it, and coverage can regress without anyone noticing.
   A single workflow running `npm ci && npm test` on pull requests is the highest-leverage
   change available here. (This touches deployment surface, so per `AGENTS.md` it needs owner
   sign-off rather than being added unilaterally — I have not added it.)
2. **The only auth/RLS tests are opt-in and therefore effectively dead.** The gated suites in
   `auth.smoke.test.ts` and `gk-media.test.ts` are well written but skip silently. Either
   provision test credentials in CI so they run, or make their absence loud (a warning line in
   the reporter) so nobody mistakes 489 green for "auth is tested".

## 4. Suggested sequencing

| Step | Work | Rough size |
| --- | --- | --- |
| 1 | Sync queue + draft-store + `media-store` permission predicates unit tests (P2, P5) | small, pure |
| 2 | Permission matrix + `requireRole` tests (P3) | small |
| 3 | CI workflow running `npm test` (§3) — needs owner approval | small |
| 4 | `ReportForm` component suite (P1) | medium |
| 5 | Extract-and-test `interactions.functions.ts` / `reports.functions.ts` (P4) | medium, refactor first |
| 6 | `roster-quality.ts` + remaining zero-coverage utilities (P7) | small, batchable |
| 7 | Route harness extended to role-gated routes only (P6) | medium |

Steps 1, 2 and 6 alone are pure-function work with no refactoring and no rendering, and cover
roughly 900 currently-uncovered statements.

## 5. What this change actually contains

Analysis only — no test or product code was written. The repository changes are the tooling
needed to reproduce the numbers above:

- `@vitest/coverage-v8` added as a dev dependency.
- A `coverage` block in `vitest.config.ts` (v8 provider, `all: true`, generated/vendored files
  excluded).
- A `test:coverage` npm script.
- `coverage/` added to `.gitignore`.

No coverage thresholds are configured. Setting a floor is worth doing, but a floor at today's
23.5% would be meaningless and a higher one would fail the build immediately — it belongs with
step 3 above, once CI exists and the P1–P3 work has moved the baseline.
