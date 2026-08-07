# Super Admin Dashboard — Signal Command Center redesign

Visual-only redesign of the Super Admin / non-mentor dashboard (`/`) to the chosen "Signal Command Center" direction. No data sources, server functions, permissions or business logic change — every number keeps coming from exactly where it does today.

## Locked design decisions

- Palette: Signal Ops — carbon base `#0d0d0d`, panel `#1c1c1c`, hairline `#2a2a2a`, volt green `#38ff5a` primary, amber `#f0b429` warning, muted red reserved strictly for genuine critical/overdue states.
- Typography: JetBrains Mono for headings, labels and all numerics; Work Sans for body copy.
- Layout: dense command centre — a 4-up KPI strip, then a 12-column panel grid, everything above the fold on desktop.

## What changes on the page

1. **KPI strip** — square-cornered panels with a 2px left status rail and a faint accent glow. Label in small-caps mono, big mono value, one line of context beneath. Green rail for healthy counts, amber for anything needing attention. Existing five cards and their click-through links stay.
2. **Duty of Care Monitor** — becomes the wide panel (8 of 12 columns). Header gains a NOMINAL / WARNING / CRITICAL legend. The five states render as compact bar + label + count rows in a 3-across grid instead of five equal boxes, with "% of roster" retained.
3. **Status Distribution** — moves alongside Duty of Care in the 4-column slot: tier label, thin inline track, mono percentage.
4. **Upcoming Interactions, Recent Activity, Alerts** — become three equal 4-column panels on the second row. Activity items get a coloured status bar instead of avatars where the event has a status; alerts become bordered tinted blocks with a mono severity code and value.
5. **Empty states** — restyled as deliberate mono readouts inside the panel ("NO SCHEDULED INTERACTIONS"), not dashed placeholder boxes.
6. **Motion** — bars ease in on load, panel border luminance lifts on hover, no bounce.

## Technical notes

- All colours go through semantic tokens in `src/styles.css`. The Signal Ops values are written onto the existing dark-theme token block (`--background`, `--card`, `--border`, `--primary`, `--warning`, `--destructive`, `--success`) plus, if needed, one new `--carbon-*` alias — no hex literals in components.
- New/edited files: `src/styles.css` (token values only), `src/components/primitives.tsx` (`StatCard`, `SectionTitle`, `Card` variants for the square command-panel look), `src/routes/index.tsx` (grid restructure and panel markup).
- `MentorDashboard` is untouched; this is the non-mentor branch only.
- Fonts: JetBrains Mono + Work Sans loaded via `<link>` in `src/routes/__root.tsx` if not already present, and mapped to `--font-display` / body font in `@theme`.
- Light mode keeps working: tokens are edited per-theme, so the light palette stays readable.
- Data, queries, period windows and permission checks are left exactly as-is.
