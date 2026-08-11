# RPM Mentor Hub: instructions for coding agents

Read [docs/RPM-LIVE-OPERATING-GUIDE.md](docs/RPM-LIVE-OPERATING-GUIDE.md) before proposing or changing anything. It is the current operating baseline for the live app.

## Working agreement

- Work in `sprint-labs/rpmmentor-7ead5abe`; do not use GKHQ, Split Decision, or a Lovable preview as a substitute.
- Start from a clean branch based on current `origin/main`. Make a short plan, implement one focused change, run proportionate checks, then make one focused commit.
- You may create local branches and commits. Do not push, merge, deploy, alter Vercel environment variables, change DNS, change Supabase Auth/RLS, run production migrations, invite users, or manipulate production data unless the owner explicitly asks in that task.
- Never print, commit, paste, or regenerate passwords, service-role keys, tokens, or `.env` values. The Vercel environment is the runtime authority for secrets.
- Treat `public.match_reports_cache` in the live RPM Supabase project as the canonical Match Report store. Google Sheets is archive/backfill/rollback material only, never a live dependency.
- Do not run `supabase db push` against production. The live project has a documented, security-conscious migration history that is not a byte-for-byte copy of this repository's historical Lovable migrations.
- Do not remove the Vercel-specific MCP aliases, SSR wrapper, PWA deny-list, or dynamic server imports without proving an equivalent Vercel build and runtime path.

## Definition of done

For a normal code change, leave: a concise plan, the changed files, focused tests, `npm run build` where the build path is affected, `git diff --check`, and one descriptive local commit. State anything not run and why.
