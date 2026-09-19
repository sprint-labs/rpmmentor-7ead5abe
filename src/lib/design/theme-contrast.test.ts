/**
 * Every colour we set text in has to be readable in every theme.
 *
 * This reads the real token values out of `src/styles.css` rather than
 * restating them, so changing a token is what fails the test — not a stale
 * copy of it drifting quietly out of date.
 *
 * Two rules are enforced, and both came from a real audit of the dashboard:
 *
 *  1. **Every text token clears 4.5:1 on the surfaces it is used on.** Dark
 *     `--destructive` was #FF1105, which is 4.33:1 on the card — every "3
 *     overdue" chip and error line failed AA while looking perfectly urgent.
 *
 *  2. **No opacity modifier on text, and no same-hue wash behind a coloured
 *     label.** `--muted-foreground` is deliberately set to a value that just
 *     clears 4.5:1; `text-muted-foreground/70` throws that away and lands at
 *     3.09:1. A `bg-tier-3/15` behind `text-tier-3` cost about a point the
 *     same way. Both are invisible in review and obvious to axe.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contrastRatio, formatRatio } from "./contrast";

const STYLES = readFileSync("src/styles.css", "utf8");
const SOURCES = ["src/components", "src/routes", "src/lib"];

/** The declarations inside one theme block, by custom-property name. */
function themeBlock(selector: string): Map<string, string> {
  const start = STYLES.indexOf(selector);
  expect(start, `theme block not found: ${selector}`).toBeGreaterThan(-1);
  const open = STYLES.indexOf("{", start);
  // Blocks are flat (no nested rules), so the first closing brace ends it.
  const body = STYLES.slice(open + 1, STYLES.indexOf("\n}", open));
  const out = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(name, value.trim());
  }
  return out;
}

/** Brand constants live in `:root` and are inherited by every other theme. */
const ROOT = themeBlock(":root {");

const THEMES = {
  light: ROOT,
  dark: themeBlock('.dark,\n[data-theme="dark"] {'),
  print: themeBlock('[data-theme="print"] {'),
} as const;

/** Resolve `var(--x)` chains down to the hex the browser would paint. */
function resolve(theme: keyof typeof THEMES, name: string, depth = 0): string {
  expect(depth, `circular token: ${name}`).toBeLessThan(10);
  const raw = THEMES[theme].get(name) ?? ROOT.get(name);
  expect(raw, `${theme}: no value for ${name}`).toBeDefined();
  const ref = raw!.match(/^var\((--[a-z0-9-]+)\)$/);
  return ref ? resolve(theme, ref[1], depth + 1) : raw!;
}

/**
 * Tokens we set text in, against the surfaces that text actually sits on.
 *
 * Body copy runs on the page itself as well as on panels, so it is checked
 * against all three. The accent and tier hues are badge colours: badges are
 * outlined, so they sit on whichever panel holds them — `--card` or `--panel`.
 *
 * That distinction is load-bearing. In the light theme `--info` and
 * `--tier-2..4` land at 4.06–4.24:1 on the page background (#F0EEE9) and on
 * the neutral chip fill (#EFEDE8). A badge moved onto either would fail, which
 * is why neither is a surface these hues are allowed on.
 */
const BODY_TOKENS = ["--foreground", "--muted-foreground"];
const ACCENT_TOKENS = [
  "--primary-ink",
  "--info",
  "--warning",
  "--destructive",
  "--success",
  "--tier-1",
  "--tier-2",
  "--tier-3",
  "--tier-4",
];

const ALL_SURFACES = ["--card", "--background", "--muted"];
const PANEL_SURFACES = ["--card", "--panel"];

function expectAA(theme: keyof typeof THEMES, token: string, surfaces: readonly string[]) {
  const fg = resolve(theme, token);
  for (const surface of surfaces) {
    const bg = resolve(theme, surface);
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${theme} ${token} (${fg}) on ${surface} (${bg}) is unparseable`).not.toBeNull();
    expect(
      ratio!,
      `${theme}: ${token} ${fg} on ${surface} ${bg} is ${formatRatio(ratio!)}, below the 4.5:1 AA floor`,
    ).toBeGreaterThanOrEqual(4.5);
  }
}

describe.each(Object.keys(THEMES) as (keyof typeof THEMES)[])("%s theme", (theme) => {
  it.each(BODY_TOKENS)("%s clears AA on the page and on panels", (token) => {
    expectAA(theme, token, ALL_SURFACES);
  });

  it.each(ACCENT_TOKENS)("%s clears AA on the panels badges sit on", (token) => {
    expectAA(theme, token, PANEL_SURFACES);
  });
});

describe("text is never dimmed below its token", () => {
  // `--muted-foreground` is chosen to sit just above 4.5:1 in each theme. Any
  // opacity modifier on it is therefore a guaranteed AA failure, whatever the
  // surface — which is why this is a flat ban rather than a ratio check.
  it("no opacity modifier on text-muted-foreground", () => {
    const offenders = grepSource(/className="[^"]*\btext-muted-foreground\/\d+/g);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  // The rule above only catches the `/40` slash syntax. A plain `opacity-*`
  // class on the same element dims the text identically and walked straight
  // past it: the dashboard's month card shipped `text-muted-foreground
  // opacity-40` on its adjacent-month days, cleared the rule above, and axe
  // then flagged every visible one of them on the deployed preview.
  //
  // Scoped deliberately:
  //   - `opacity-0` and `opacity-100` are not partial dimming. Zero is a
  //     hidden reveal-on-hover control, which contrast rules do not apply to.
  //   - A variant-prefixed value (`disabled:opacity-30`, `group-hover:`,
  //     `focus:`) is state-scoped, and a disabled control is exempt from AA.
  //   - `components/ui` is vendored shadcn, not this project's design work.
  it("no partial opacity on an element carrying text-muted-foreground", () => {
    const DIMMED = String.raw`(?<![\w:-])opacity-(?!0\b)(?!100\b)\d+`;
    const offenders = grepSource(
      new RegExp(
        `className="[^"]*(?:\\btext-muted-foreground\\b[^"]*${DIMMED}|${DIMMED}[^"]*\\btext-muted-foreground\\b)`,
        "g",
      ),
      /\/components\/ui\//,
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("a tier or status badge never sits on a wash of its own hue", () => {
  // Tailwind mixes these in oklab, so the effective background is darker than
  // a plain alpha blend suggests and the label loses roughly a point of
  // contrast. Measured with axe against the compiled stylesheet: Tier 1 fell
  // to 4.44:1 in light mode and Academy to 3.97:1 in both. The hue still reads
  // from the text, the border and the bar.
  //
  // Scoped to the two badge style maps rather than the whole app: the same
  // pattern on an alert box is a different question, because the ratio depends
  // on the hue and `--destructive` / `--warning` do clear it.
  it.each(["src/components/primitives.tsx", "src/components/goalkeeper-distribution.tsx"])(
    "%s defines no filled badge",
    (file) => {
      const source = readFileSync(file, "utf8");
      const offenders = source
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) =>
          /"[^"]*bg-(tier-\d|info|warning|success|destructive)\/\d+[^"]*"/.test(line),
        )
        .map(([n, line]) => `${file}:${n}  ${line.trim()}`);
      expect(offenders, offenders.join("\n")).toEqual([]);
    },
  );
});

/** Every `file:line` in the app source whose className matches. */
function grepSource(pattern: RegExp, exclude?: RegExp): string[] {
  const hits: string[] = [];
  for (const file of walk(SOURCES)) {
    if (exclude?.test(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
  return hits;
}

function walk(roots: readonly string[]): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(path);
    }
  };
  roots.forEach(visit);
  return out;
}
