# 25 August 2026 live-schema baseline

This non-deployable fixture is the ten-part snapshot used to initialise the
isolated RPM Mentor Hub staging project from the then-current live schema.

It exists for structural comparison, recovery planning and clean-room replay
work. It is **not** the production migration ledger and must not be moved into
`supabase/migrations/` or pushed to either environment.

Production's deployable, version-matched chain lives in
`supabase/migrations/`. See `docs/SUPABASE-MIGRATION-RECONCILIATION.md` for the
validation and release rules.
