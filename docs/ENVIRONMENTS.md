# Environments

One repository, two runtime environments. This file is the reference for which
branch feeds which host and which database.

## Intended topology

| Environment | Branch | Vercel project          | Supabase project                          | URL                              |
| ----------- | ------ | ----------------------- | ----------------------------------------- | -------------------------------- |
| Production  | `main` | `mentor-hub`            | RPM Mentor Hub (`zdxxezquhvpjmoxlecjp`)   | rpmmentor.com                    |
| Staging     | `dev`  | `rpm-mentor-hub-staging`| RPM Mentor Hub — Staging (`emyxyqqftwnjpcmctkpe`) | rpm-mentor-hub-staging.vercel.app |

Feature branches open a pull request against `dev`. Vercel builds a preview for
every pull request; those previews point at the staging database. Once a change
is confirmed on staging, `dev` merges into `main` and ships to production.

## Rules

- **Never point a preview or staging build at the production database.** The
  Supabase project ref is set per Vercel project and per environment, not in the
  repository.
- **`.env` is gitignored.** Copy `.env.example` and fill it in locally. Local
  development points at staging.
- **Migrations are forward-only and applied deliberately.** Do not run
  `supabase db push` against production; it has an authoritative migration
  ledger recorded in `supabase-production-migration-manifest.json`. Apply a
  migration to staging first, confirm the feature, then apply the identical file
  to production as part of the `dev` -> `main` release.

## Migration ledger divergence

Production and staging do not share migration history. Staging was rebuilt from
a snapshot of live on 2026-08-25 (`staging_live_snapshot_001..010`), so the same
logical change can carry a different version timestamp in each ledger. Compare
ledgers by migration **name**, not version, and treat the manifest as the
source of truth for what production has actually run.
