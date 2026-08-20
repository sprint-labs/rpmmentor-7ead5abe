# Test coverage analysis — RPM Mentor Hub

Measured on `main` @ `341690b` with `vitest run --coverage` (v8 provider, `src/**/*.{ts,tsx}`,
excluding `*.test.*`, `routeTree.gen.ts`, and the generated `integrations/supabase/types.ts`).

The coverage provider is not a declared dependency — it was installed transiently for this
measurement (`npm i --no-save @vitest/coverage-v8`). Nothing in `package.json` changed.

## Where we are

```
Test files   67 passed | 1 skipped (68)
Tests       489 passed | 12 skipped (501)      ~28s

Statements   22.47%   (2232/9932)
Branches     18.52%   (1561/8427)
Functions    18.21%   (442/2426)
Lines        23.28%   (1983/8516)
```

By area, ordered by uncovered lines:

| Area | Files | Lines | Uncovered | Line % |
|---|---:|---:|---:|---:|
| `src/components` (app) | 21 | 2463 | 2022 | 17.9% |
| `src/routes` (pages) | 32 | 1879 | 1710 | 9.0% |
| `src/lib` (rest) | 63 | 1915 | 1322 | 31.0% |
| `src/components/ui` (shadcn) | 46 | 792 | 701 | 11.5% |
| `src/lib/match-reports` | 11 | 841 | 430 | 48.9% |
| `src/lib/interactions` | 8 | 310 | 163 | 47.4% |
| `src/lib/events` | 8 | 213 | 95 | 55.4% |
| `src/integrations` | 5 | 63 | 59 | 6.3% |

The 501 tests we do have are good ones. Match Reports, interactions, and the events/follow-up
chain are genuinely well covered (47–55% line, and the branch work is concentrated on the
tricky parts: ledger races, duplicate identity, OCR merge, follow-up linking). This is not a
project with no testing discipline. It is a project where the testing discipline stopped at the
`src/lib` boundary and never crossed into the server functions, the auth gate, or the UI.

The headline number (23%) is also unfairly depressed by `src/components/ui` — 46 unmodified
shadcn primitives, 792 lines, 11.5% covered. Those are vendored and should be excluded from any
coverage target rather than tested. Excluding them, the real figure is ~24.5%.

---

## The gaps that matter

### 1. Server functions are effectively untested — 22 files, 1210 lines, 12% covered

This is the single biggest hole, and it is where the authorization lives.

| Coverage | Lines | File |
|---:|---:|---|
| 0% | 7 | `lib/install-analytics.functions.ts` |
| 1.1% | 92 | `lib/match-reports/backfill.functions.ts` |
| 2.1% | 48 | `lib/integrations/sheets-status.functions.ts` |
| 2.9% | 170 | `lib/match-reports/reports.functions.ts` |
| 3.3% | 61 | `lib/mentor-dashboard.functions.ts` |
| 5.1% | 39 | `lib/executive-dashboard.functions.ts` |
| 5.7% | 122 | `lib/interactions.functions.ts` |
| 8.7% | 46 | `lib/integrations/github-status.functions.ts` |
| 9.1% | 33 | `lib/account.functions.ts` |
| 10.3% | 87 | `lib/api/transcribe.functions.ts` |
| 10.6% | 123 | `lib/admin-users.functions.ts` |
| 14.6% | 41 | `lib/match-reports/report-edit-access.functions.ts` |
| 15.2% | 46 | `lib/events/follow-up.functions.ts` |
| 15.4% | 65 | `lib/api/summarize.functions.ts` |
| 31.5% | 73 | `lib/players.functions.ts` |
| 53.8% | 78 | `lib/calendar.functions.ts` |

The cause is structural, not neglect. A `createServerFn().middleware().validator().handler()`
chain has no exported seam — the handler body cannot be invoked from a test without standing up
the whole TanStack Start request context, so nobody does.

**We already have the fix pattern in the codebase.** `lib/events/follow-up-query.server.ts`
exports `loadCompletions(supabase, ids)` as a plain function with the client injected, and
`follow-up-query.server.test.ts` drives it with a hand-rolled Supabase stub. Same for
`notify.server.ts`, `link-follow-up.server.ts`, `match-reports/store.server.ts` (74–95%
covered). The `.server.ts` files are covered; the `.functions.ts` files are not.

**Proposal:** extract each `.functions.ts` handler body into a sibling `.server.ts` function
taking `(supabase, userId, input)`, leave the `createServerFn` wrapper as a thin adapter, and
test the extracted function. Start with `reports.functions.ts` (170 lines, the canonical Match
Report write path) and `admin-users.functions.ts` (the destructive-operations surface).

### 2. Privileged admin operations have zero guard tests — `lib/admin-users.functions.ts`, 10.6%

Seven server functions — create user, invite user, delete user, set role, reset password, list
users, read the deletion audit — and every one of them re-implements its own gate inline:

```ts
if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");
```

Three also carry a self-protection rule that exists nowhere else and is asserted by nothing:

- "You cannot change your own role from this screen."
- "You cannot delete your own account from this screen."
- "You cannot reset your own password from this screen."

Two problems. First, none of this is tested — a refactor that drops one `if` deletes a
super-admin gate on account deletion and no test goes red. Second, these gates bypass
`lib/roles.server.ts` entirely, which is the file that exists precisely to be the one canonical
allowlist, and which *is* well covered (73.7%) and *is* documented as mirroring the RLS
policies. `SUPER_ADMIN_ROLES` is declared there and unused here.

**Proposal:** route these through `requireRole(supabase, userId, SUPER_ADMIN_ROLES, action)`,
extract the self-protection rules into a pure `assertNotSelf(actorId, targetId, action)`, and
test the table: each of the 7 operations × {super_admin, admin, mentor_manager, mentor, no role}
× {self, other}.

### 3. The permission matrix is 96 cells; roughly 6 are asserted — `lib/auth.tsx`, 14.9%

`roleHasPermission()` is the one client-side gate for all role-gated UI, backed by a
`Record<Role, Permission[]>` of 4 roles × 24 permissions. `admin-submit-permissions.test.ts`
asserts `reports.submit` parity across roles and two `admin` permissions. Everything else is
unpinned.

The matrix has asymmetries that may well be deliberate but that no test records — e.g. `admin`
holds `media.edit` but not `media.upload`, while `mentor` holds `media.upload`, and
`super_admin` re-adds it. Today nobody can tell from the test suite whether that is a decision
or a bug.

There is also a client/server parity surface that is only 1/6 tested. `roles.server.ts` declares
six allowlists (`CLUB_EDIT_ROLES`, `INTERACTION_MANAGE_ROLES`, `SUPER_ADMIN_ROLES`,
`REPORT_SUBMIT_ROLES`, `REPORT_MANAGE_ROLES`, `EXECUTIVE_DASHBOARD_ROLES`) whose comments say
they mirror both the client matrix and the RLS policies. I checked them by hand and they are
currently aligned — but only `REPORT_SUBMIT_ROLES` has a test holding it that way.

**Proposal:** a single table-driven test that snapshots all 96 cells, plus a parity test
iterating every `(client permission, server allowlist)` pair. Cheap to write, and it turns the
"change both together" comments into something enforced.

### 4. The offline sync queue is untested and has three confirmed defects — `lib/sync/queue.ts`, 5.6%

This queue holds mentors' unsaved Match Reports in `localStorage` when they submit from a
touchline with no signal. `sync-manager.test.tsx` covers the UI shell but `vi.mock`s the queue
module wholesale, so `drainQueue`, the retry/backoff, and the drop policy have never run under
test. I wrote three throwaway probes against the real module; all three failed. (The probe file
was deleted — these are reported, not fixed, since fixing them is outside an analysis task.)

**a. Backoff never engages.** `nextRetryAt()` anchors to `job.createdAt`, not to the last
attempt:

```ts
const delay = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, job.attempts - 1), 5 * 60_000);
return job.createdAt + delay;          // ← createdAt, not last-attempt time
```

A job created 60s ago and failed on this drain has `createdAt + 5s` already in the past, so the
very next drain retries it immediately. Probe: handler called twice on two back-to-back drains
with no delay. In practice a queued report drafted more than five minutes ago burns all 8
attempts in one drain pass and is then dropped (see c).

**b. `subscribe()` leaks its `storage` listener.** The returned cleanup removes the
`rpm:sync-queue-changed` listener but not the `storage` one, which was registered with an
anonymous handler that is never retained:

```ts
window.addEventListener("storage", (e) => { if (e.key === KEY) cb(); });
return () => {
  window.removeEventListener("rpm:sync-queue-changed", handler);   // storage never removed
};
```

Probe: callback still fires after unsubscribe. Every mount/unmount of a subscriber leaks a
callback holding its closure.

**c. A non-transient failure silently deletes the user's work.** `isTransient()` pattern-matches
the error message; anything that doesn't look like a network error is `removeJob`'d and counted
as `dropped`. Probe: a queued report labelled *"Match report — Beadle vs Blackburn"* failing
with `"permission denied"` is gone from the queue, with no `needsAction` flag and nothing shown
to the mentor. The code comment says this is intentional ("logical failures are dropped so we
don't spin forever"), but `NeedsUserActionError` already exists as the non-destructive path, and
silently discarding a submitted match report is a data-loss bug regardless of intent.

**Proposal:** this is the highest value-per-line target in the repo. ~190 lines, pure and
localStorage-backed, needs no Supabase stub, and testing it surfaces real defects immediately.

### 5. The client-side auth gate is 0% covered — `components/app-shell.tsx`, 508 lines

`AppShell` is the only thing standing between an unauthenticated visitor and the app: it calls
`isPublicRoute(path)`, redirects to login, filters `NAV` by `can(n.perm)`, and decides the
primary action per role. `public-routes.ts` (the 4-line helper) is tested; the 508-line consumer
is not. The one test that touches this file, `test/goalkeepers-page.test.tsx`, mocks it out
entirely (`AppShell: () => <Outlet />`).

**Proposal:** render `AppShell` under jsdom with a stubbed auth context and assert the three
behaviours that matter — unauthenticated on a private route redirects; nav items appear/vanish
per role; the primary action resolves correctly for each role. `workflows.interaction.test.tsx`
already establishes the render-with-mocked-server-fns harness to copy.

### 6. Large components with real logic — `voice-note-field.tsx` 0.6%, `workflows.tsx` 23%

`voice-note-field.tsx` is 1437 lines at 0.58% — recording state machine, transcription
round-trip, retry, placement into the report. `workflows.tsx` is 3402 lines at 24.9%; the two
tests it has cover the interaction and media paths, leaving most of the form logic untouched.
`components/mentor/mentor-dashboard.tsx` (668 lines) and `mentor-workflow.tsx` (589 lines) are
at 0.9% and 0%.

These are expensive to test as components. The better return is to pull the non-visual logic
out — the state machine in `voice-note-field`, the per-step validation in `workflows` — into
`src/lib` modules where this repo's tests already live and thrive.

### 7. Nothing runs the tests automatically

There is no `.github/` directory. 501 tests, `npm test` is wired and green in ~28 seconds, and
no CI invokes it. The 12 skipped tests are the credential-gated auth/storage smoke tests in
`auth.smoke.test.ts` and `storage/gk-media.test.ts`, which will skip forever until something
sets `TEST_MENTOR_EMAIL` / `TEST_MENTOR_PASSWORD`.

**Proposal:** a GitHub Actions workflow running `npm ci && npm test` on PRs. Everything below
this line is worth less without it. (Note the `AGENTS.md` caveat: `npm run lint` currently hits
a large historical Prettier baseline, so gate on `npm test` first and add lint separately.)

---

## Suggested order

Ordered by risk reduced per unit of effort, not by lines covered.

| # | Target | Why first | Rough size |
|---|---|---|---|
| 1 | CI running `npm test` on PRs | Nothing else holds without it | ~30 min |
| 2 | `lib/sync/queue.ts` | 3 confirmed defects incl. silent data loss; pure module, no stubs | ~half day |
| 3 | Permission matrix + client/server parity table | 96 cells, ~6 pinned; guards security-facing behaviour | ~half day |
| 4 | `admin-users.functions.ts` guards via `roles.server.ts` | Destructive ops with untested, duplicated gates | ~1 day (incl. extraction) |
| 5 | `.server.ts` extraction for `reports.functions.ts` | Canonical Match Report write path at 2.9% | ~1–2 days |
| 6 | `app-shell.tsx` auth/nav gating | Sole client auth gate at 0% | ~1 day |
| 7 | Logic extraction from `voice-note-field` / `workflows` | Largest raw gap, lowest value density | ongoing |

Two housekeeping items to pair with the above: add `@vitest/coverage-v8` as a devDependency with
`src/components/ui` and the generated files excluded, so coverage is reproducible; and set a
ratchet rather than a target — fail CI if coverage drops below the current number, and raise the
floor as each item above lands.
