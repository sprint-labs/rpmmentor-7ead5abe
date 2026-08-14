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

## Cursor Cloud specific instructions

This is a single-process TanStack Start app. Standard commands live in `package.json` and `docs/RPM-LIVE-OPERATING-GUIDE.md`. Use **npm** (the lockfile and operating guide), not bun, even though `bun.lock` is also committed.

- `npm run dev` serves the UI, SSR, and server functions together at **http://localhost:8080/** (not Vite's default 5173). Unauthenticated visits to `/` hydrate into login; open `/login` directly for UI work. A first-load hydration mismatch (`Expected server HTML to contain a matching <main>`) can leave a logo-only shell until refresh — that is a known local-dev gotcha, not a missing-install failure.
- The tracked `.env` is enough to boot locally, but it points at the **legacy unrelated** Supabase project, not production `zdxxezquhvpjmoxlecjp`. Do not copy those values into Vercel. `SUPABASE_SERVICE_ROLE_KEY` is not present, so admin/server-function paths that use `client.server.ts` fail until it is added in untracked `.env.local`.
- Auth/storage smoke tests in `src/lib/auth.smoke.test.ts` and `src/lib/storage/gk-media.test.ts` skip unless `TEST_MENTOR_EMAIL` / `TEST_MENTOR_PASSWORD` (and the admin pair) are set. Broad `npm run lint` hits a large historical Prettier baseline; treat it as documented in the operating guide, not as a focused-change failure.
- Optional AI/Sheets keys (`LOVABLE_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_SHEETS_API_KEY`) degrade gracefully when absent. Do not start Docker, local Supabase, or `supabase db push` for ordinary cloud-agent work.
