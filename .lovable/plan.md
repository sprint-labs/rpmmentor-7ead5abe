
# Match Reports implementation audit (read-only)

No files were edited, no rows written, no integrations changed. All Sheet reads were GET calls through the Google Sheets connector ("Dez Google Sheets", gateway-backed, linked to this project).

## 0. Source reconciliation — "Match_Reports_DB_01"

Evidence from `GET /v4/spreadsheets/1UHesbMdPt89d_oZ86iIppQqkFQyWWwuIxklFEjfdywU`:

```text
properties.title = "Match_Reports_DB_01_Loveable"
sheets = [ { sheetId: 173891700, title: "GKHQ Propietry Data Hub", index: 0,
             gridProperties: { rowCount: 999, columnCount: 26 } } ]
locale = en_GB   timeZone = America/Los_Angeles   autoRecalc = ON_CHANGE
```

Conclusion: `Match_Reports_DB_01` is the **spreadsheet file name** (`Match_Reports_DB_01_Loveable`), not a tab or an old ID. `GKHQ Propietry Data Hub` is the **only** tab in that file. The configured source in `src/lib/match-reports/schema.ts` (SHEET_ID + SHEET_TAB) is therefore current and correct — the two names refer to the same object at different levels. No source switch is needed or proposed.

## 1. Active tab, headers, positions, formulas, positional dependencies

Header row = **row 1**; data starts at **row 2**; ~93 data rows (last populated row ~94).

| Col | Header text (A1:N1) | Code key (`COLUMN_INDEX`) |
|---|---|---|
| A | Goalkeeper | goalkeeper (0) |
| B | Coach | coach (1) |
| C | Team | team (2) |
| D | Opponent | opponent (3) |
| E | Match Date | match_date (4) |
| F–L | Protect the Goal / Space / Air, Control the Play, Change the Play, Courage / Control / Intelligent / Competitor, Speed, Agility, Athleticism | 7 pillars (5–11) |
| M | Av Score | average (12) |
| N | Comments | comments (13) |
| **O** | **(no header — empty)** | **competition (14) — code writes here** |

Findings:
- **There is no Competition column and no Source column in the Sheet.** Column O has no header and no data in any of the ~93 rows, yet `submitMatchReport` writes `payload.competition` into O. New submissions land in an unlabelled column; every historical row returns `competition: null`.
- **No formulas anywhere.** `valueRenderOption=FORMULA` on A1:Z12 returned literal values; column M ("Av Score") is hard-coded numbers, not `=AVERAGE(...)`. Nothing recalculates on append.
- Historical averages are full precision (`4.285714286`), the app writes 1 dp (`4.3`) — a cosmetic inconsistency already present in live data. One legacy anomaly: row 4 (Max Crocombe vs Coventry) shows `3.4` where the pillars average `3.428571429`.
- Match Date cells are real dates rendered `d/m/yyyy`; spreadsheet locale `en_GB`, so `formatSheetDate` + `USER_ENTERED` writes parse correctly today.
- Positional/format dependencies found: **one banded range** covering A1:P98 (cosmetic; does not extend to rows past 98), header row colouring. **No** protected ranges, conditional formats, filter views, basic filter, charts, or developer metadata. Nothing outside this app reads the tab by column position that the API can see.
- Consequence: appending rows is safe; **inserting or reordering columns is the only real risk**, and adding new columns to the right (P, Q…) is safe.

## 2. Code mapping and write paths

- Sheet I/O: `src/lib/match-reports/sheets.server.ts` — `readAllRows` (`'GKHQ Propietry Data Hub'!A2:O`), `appendRow` (`A1:append`, USER_ENTERED, INSERT_ROWS), `getSheetGid`, `deleteRow`; retry/backoff on 429/5xx.
- Schema/mapping: `src/lib/match-reports/schema.ts` — `COLUMN_INDEX`, `SHEET_HEADERS` (15 entries incl. "Competition" that does not exist in the Sheet), `rowToMatchReport`, `computeReportId`, `averageOfScores`, `parseSheetDate`, `formatSheetDate`.
- Server functions: `src/lib/match-reports/reports.functions.ts` — `listMatchReports`, `getMatchReport`, `submitMatchReport`, `deleteMatchReport`; all behind `requireSupabaseAuth`.
- Cache: `public.match_reports_cache` (has `competition`, no `source`), mirrored on list and on submit, pruned on list, deleted on delete.
- Form: `src/components/workflows.tsx` `ReportForm` (Competition is a required input with a league datalist; Coach is read-only/disabled; Team auto-fills from `players`).
- Write paths to the Sheet, complete list: (a) `ReportForm` → `submitMatchReport`; (b) offline replay `src/components/sync-manager.tsx` job type `submitMatchReport` → the same server fn; (c) `deleteMatchReport`. No other code appends.
- Read consumers: `src/routes/reports.index.tsx`, `src/routes/reports.$reportId.tsx`, `src/routes/goalkeepers.$gkId.tsx`, `src/components/report-preview-modal.tsx` (shows competition), `src/lib/integrations/sheets-status.functions.ts`, MCP tool `src/lib/mcp/tools/list-match-reports.ts` (reads the cache under RLS; does not select `competition`).
- Outside this project / unprotectable: there is no `src/routes/api/` and no `/api/public/*` route, so no unauthenticated HTTP surface exists here. The genuinely unprotectable surface is the **Google Sheet itself** — anyone with Drive access can edit/reorder columns, and the app cannot prevent it. MCP endpoints (`/mcp`, `/.mcp/*`) are authenticated and read-only.

## 3. Comments, drafts, OCR, voice

- Comments: single textarea, `maxLength 5000`, schema `z.string().max(5000)`, written verbatim to column N. OCR and voice transcripts are merged into this same field (replace or append with a blank line) — the Sheet keeps no separate transcript provenance.
- Draft/autosave: `src/lib/match-reports/draft-store.ts` — localStorage, one slot per user (`rpm.report-draft.v2.<userId>`), 30-day retention, 5 s debounce, `version`/`tabId` optimistic concurrency, cross-tab conflict UI in `workflows.tsx`. Drafts are device-local only — never server-side.
- OCR: `src/components/handwritten-notes-field.tsx` → `transcribeNotes` in `src/lib/api/transcribe.functions.ts` (Lovable AI Gateway, 8 MB cap, authenticated).
- Voice: `src/components/voice-note-field.tsx` → `transcribeVoiceNote`; confidence tokens, review state, original + version history persisted in the draft (`VoiceTranscriptDraft`), never exported to the Sheet.

## 4. Coach derivation and gaps

`submitMatchReport` resolves Coach server-side from `profiles.name || profiles.email`; mentors cannot override, `super_admin`/`admin`/`mentor_manager` may submit on another coach's behalf. The offline replay path reuses the same server fn, so derivation holds there too. Gaps:
- If a profile has neither name nor email, `resolvedCoach` becomes `""` and bypasses the Zod `min(1)` check (validation runs on the client-supplied `coach`, not the resolved one).
- No validation that Coach matches a known mentor — free text for privileged overrides.
- Historical data: **roughly 40 of ~93 rows have an empty Coach cell** (e.g. Sam Long 18/10/2025, Jake Eastwood 18/10/2025, Liam Roberts 28/10/2025). Any coach-based filter silently drops these.

## 5. Source field

Not persisted and not mapped anywhere: no Sheet column, no `match_reports_cache.source` column, no field in `matchReportSubmitSchema` or `MatchReportRow`. (`src/lib/nav-source.ts` / the `source` URL param on `/reports` is unrelated breadcrumb state.) Origin of a row is currently only inferable indirectly: rows written by the app have a 1 dp average and a populated Coach.

## 6. Duplicate protection and metadata

- **None.** `appendRow` always appends; nothing checks for an existing `goalkeeper + match_date + opponent` before writing. A double submit or an offline replay after a slow-but-successful first write creates two identical Sheet rows.
- `computeReportId` is a non-cryptographic 32-bit hash, so duplicates collapse to one `report_id`: the cache upsert overwrites, `/reports/$reportId` returns only the first match, `deleteMatchReport` deletes only the first row. Collisions between genuinely different fixtures are also theoretically possible.
- No created-at, submitter ID, or client/app marker is written to the Sheet.

## 7. Proposed implementation (strictly scoped, no layout change)

Guardrails for every step: form layout unchanged; seven pillars, their order, the 1–5 defaults of 3 and the mean-of-7 average unchanged; columns A–N never reordered, retyped, or rewritten; historical rows never touched; append-only writes.

1. **Label the existing Competition column (O).** Write the single header cell `O1 = "Competition"` (one `values.update` to `O1` only). This is the only Sheet mutation proposed; it fills a blank cell inside the existing banded range and touches no data row. Code already reads and writes O, so no mapping change.
2. **Add a Source column (P).** Write `P1 = "Source"`; add `source: 15` to `COLUMN_INDEX`, append `"Source"` to `SHEET_HEADERS`, extend `readAllRows` to `A2:P`, and stamp `"Mentor Hub"` (plus a queued-replay marker for offline submissions) on new rows only. Historical rows stay blank and map to `source: null`.
3. **Persist source + competition end-to-end.** Add a nullable `source text` column to `match_reports_cache` via migration (grants unchanged), map it in `MatchReportRow`, the list/submit cache mirrors, and surface it read-only on the report detail page.
4. **Duplicate protection at the write boundary.** Before appending, `readAllRows` and reject an exact `goalkeeper + match_date + opponent` match with a clear "a report already exists for this fixture" error, plus an explicit override flag for privileged roles. Reuse the same check in the offline replay so a retried job cannot double-write. Optionally strengthen `computeReportId` — deferred, since changing it re-keys the cache.
5. **Close the coach gaps.** Validate `resolvedCoach` is non-empty server-side and fail the submit with an actionable message when the profile has no name; validate privileged overrides against known mentor profiles.
6. **Leave averages alone.** Keep writing 1 dp; do not rewrite the ~93 historical full-precision values or the `3.4` anomaly. If exact parity is wanted later, that is a separate, explicit data-migration decision.

Not in scope: moving the source of truth to Supabase, changing pillars/labels/defaults, backfilling Coach or Competition on historical rows, touching column M, and any change to draft/OCR/voice behaviour.

### Concerns to flag before implementation

- Writing `O1`/`P1` is a Sheet mutation, however small — I will not do it without explicit approval, and it should be done when no one is editing the file.
- The Sheet is editable outside the app; any column insert breaks positional mapping. A cheap mitigation is a header assertion on read (compare A1:P1 against `SHEET_HEADERS` and surface a banner on `/system/integrations` if they diverge) rather than silently mis-mapping.
- `parseSheetDate` falls back to `Date.parse`, which reads ambiguous text dates as US m/d. Only a risk if someone types a date as text; worth a defensive tweak while in the file.

### Verification plan

1. Re-read `A1:P1` and confirm the two header cells, with A–N byte-identical to today.
2. Re-read `A2:P` and diff row count and every A–N cell against a pre-change snapshot — expect zero differences.
3. Submit one report in preview: confirm one new row, Competition in O, Source in P, average = mean of the seven pillars to 1 dp, Coach = the signed-in profile name.
4. Re-submit the identical fixture: expect the duplicate to be rejected, with no new Sheet row.
5. Go offline, submit, come back online: exactly one row appended, `source` marked as replayed.
6. Confirm `/reports`, `/reports/$reportId`, `/goalkeepers/$gkId`, the preview modal and the MCP tool still render historical rows unchanged (competition/source blank), and `/system/integrations` still reports the tab as reachable.
