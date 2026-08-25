# Supabase migration reconciliation

Captured on 25 August 2026 against `origin/main` at
`a04e29a73949161d2bf4ede7eceecfb3e88ac046`.

This document records the repository reconciliation completed on the working
branch and the three reviewed forward migrations subsequently applied to both
staging and production. No `db push` or migration repair was used.

The machine-readable evidence is in
[`supabase-production-migration-manifest.json`](supabase-production-migration-manifest.json).

## Outcome

The `origin/main` migration folder at the captured SHA was not a safe
production deployment source:

- `origin/main` contains 41 active SQL migration files.
- Production contained 36 migration-ledger rows before this release; it now
  contains 39.
- Only 24 production statements are byte-for-byte present in a repository
  file. Two more production statements are contained inside larger repository
  files. Ten production statements have no exact repository equivalent.
- The merged 22 August security migration has no production ledger row, even
  though its guarded `list_mentor_directory()` function and optimised RLS
  expressions are present in the live schema. It was therefore applied outside
  the recorded migration chain.
- The tracked `supabase/config.toml` contained the legacy cloud project id
  `mldlwxtsfgeeozsgtqth`. This branch replaces it with the neutral local id
  `rpmmentor-7ead5abe`; cloud operations must still name and verify their target.

Do not run `supabase db push`, `supabase db push --include-all`, or
`supabase migration repair` against production in this state. Supabase compares
local versions with `supabase_migrations.schema_migrations`; repair changes that
history table without applying or reverting the underlying SQL.

## What changed after 20 August

Production had 32 recorded migrations after the media and safe Super Admin
deletion releases, then gained these four migrations:

1. `20260824150611_support_inbox_and_broadcasts`
2. `20260824161128_parity_repair_players_tier`
3. `20260824161140_players_tier_effective_from`
4. `20260824161232_duty_of_care_engine`

The repository also gained
`20260822154500_security_rls_initplan_and_mentor_directory.sql`, but production
has the resulting schema state without a matching ledger entry.

The existing staging project, `emyxyqqftwnjpcmctkpe`, was built with ten
current-schema snapshot migrations. The three hardening migrations were then
applied to it, so its ledger contains 13 rows and remains intentionally
different from production's historical ledger.

## Verified production-to-staging parity

After the forward hardening release, read-only catalogue fingerprints match
exactly between production and staging:

| Section                     | Items | Fingerprint                        |
| --------------------------- | ----: | ---------------------------------- |
| Tables                      |    25 | `a84f97421826e56cc390fe4266c2a71c` |
| Columns                     |   265 | `6f7de5b95fde13d97a20a265141d6023` |
| Constraints                 |    81 | `293136e10e7f7faf83461df15806f3a0` |
| Indexes                     |    89 | `a7ad20c236f2d7cc4fc936c3cb803b48` |
| Functions                   |    22 | `dfd88ec6dd25d906e0e5f3d30a580df1` |
| Views                       |     1 | `8a6ec75acb23d3cd1c192ebaf8047e3e` |
| Public and storage policies |    81 | `2c94cf2d9e14b244c41707e1cec7dc8d` |
| Triggers                    |    19 | `fbd601ccbf6ab3b305b17cf08cdd2caa` |
| Comments                    |    26 | `85ca1464975ffd904a1f33993da1a162` |
| Table ACL entries           |   579 | `fe72c21d2078e268d17036bd8bfc488d` |
| Routine ACL entries         |    71 | `85c60f5e9a8f4e0d32a2213770b82945` |

This proves that the two projects remain structurally aligned after hardening.
The exact 36-file production chain plus all three forward migrations also
replayed successfully from an empty PostgreSQL 16 database before production
application.

## Implemented repository reconciliation

This branch implements the following dedicated change:

1. Move the 41 existing historical files out of the executable
   `supabase/migrations/` folder without changing their contents. A suitable
   location is `supabase/archive/legacy-migrations/`, with a README stating that
   they are historical evidence and must never be replayed automatically.
2. Export the 36 recorded statements from production project
   `zdxxezquhvpjmoxlecjp` into `supabase/migrations/` using exact live versions,
   names and SQL hashes. `npm run check:migrations` verifies them against the
   JSON manifest and permits only reviewed newer forward migrations.
3. Keep the ten staging snapshot migrations separately under a non-executable
   path such as `supabase/baselines/2026-08-25-rpm-live/`. They are useful as a
   deterministic schema-parity fixture, but they are not production's ledger.
4. Capture the already-live, unledgered 22 August security state in newly
   generated forward migration `20260825181827`, followed in that same file by
   the final fail-closed player/Auth/API-grant definitions. The old source file
   remains archived and cannot later overwrite the final policies.
5. Ensure that forward migration runs before any final fail-closed player,
   Auth, or API-grant definitions. Replaying the older security file afterwards
   could restore superseded policy definitions.
6. Preserve `supabase/tests/` unchanged. The Harrison Male and Daniel Barden
   SQL files remain archived reference-data history rather than executable
   schema migrations.

The resulting active folder contains all 39 production-ledger migrations using
their exact live versions, names and SQL hashes. The archive contains all 41
former files, and the non-deployable staging baseline contains its ten snapshot
files.

## Completed validation gate

Before production application, the proposed repository state was validated
with read-only checks:

1. Re-read production `supabase_migrations.schema_migrations` and compare every
   historical file's version, name, statement count, SQL length, and SQL MD5 to
   the manifest.
2. Require exactly 36 historical matches and only the three explicitly reviewed
   forward migrations beyond them.
3. Re-run the production-to-staging catalogue and ACL fingerprints above.
4. Run Supabase security and performance advisors for both projects and record
   all remaining warnings.
5. Run the normal application tests and authenticated staging smoke tests.

No `db push` or ledger repair was performed.

## Replay and release gate

The exact 36-file chain plus all three forward migrations replayed successfully
in an isolated, socket-only PostgreSQL 16 database. They were then applied to
staging and, after tests, type-check and production build passed, to production
as `20260825181827`, `20260825181841`, and `20260825181851`. Ledger/hash checks,
advisors and durable permission/data-preservation read-backs are release gates.

Reference: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
and [Supabase CLI migration commands](https://supabase.com/docs/reference/cli/supabase-migration).
