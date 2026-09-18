import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Check, Moon, Printer, Sun, X } from "lucide-react";
import { Card, PageHeader, SectionTitle } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { formatRatio, gradeContrast } from "@/lib/design/contrast";

export const Route = createFileRoute("/design/gkhq")({
  component: GkhqDesignSystemPage,
});

/**
 * GKHQ Design System — the shared reference for RPM's products.
 *
 * Ported from GKHQ Scouting Hub so Mentor Hub and GKHQ read as one family.
 * Like /design/accent-proposal, this page is rendered from the real tokens in
 * src/styles.css in whichever theme you are previewing — it is a live audit,
 * not a screenshot. If a token drifts out of contrast, the grades below turn
 * red on their own.
 *
 * The system in one line: carbon surfaces, one GK Green accent, and two colour
 * families that are never mixed — traffic light for state, tags for category.
 */

/** Every custom property this page reads back out of the active theme. */
const TOKEN_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--panel",
  "--muted-foreground",
  "--border",
  "--primary",
  "--primary-ink",
  "--primary-foreground",
  "--success",
  "--warning",
  "--destructive",
  "--info",
  "--neutral",
  "--flux-magenta",
  "--ember-orange",
  "--tier-1",
  "--tier-2",
  "--tier-3",
  "--tier-4",
  "--rating-elite",
  "--rating-strong",
  "--rating-average",
  "--rating-developing",
  "--rating-poor",
  "--carbon-bg",
  "--carbon-section",
  "--carbon-panel",
  "--carbon-card",
  "--carbon-raised",
  "--carbon-border",
] as const;

type TokenVar = (typeof TOKEN_VARS)[number];
type TokenValues = Partial<Record<TokenVar, string>>;

function useThemeTokens(): TokenValues {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState<TokenValues>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cs = getComputedStyle(document.documentElement);
    const next: TokenValues = {};
    for (const v of TOKEN_VARS) next[v] = cs.getPropertyValue(v).trim();
    setTokens(next);
  }, [theme]);

  return tokens;
}

function GradeChip({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span
      data-testid="grade-chip"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium whitespace-nowrap",
        pass
          ? "border-primary-line bg-primary-fill text-primary-ink"
          : "border-destructive-line bg-destructive-fill text-destructive",
      )}
    >
      {pass ? <Check className="size-3" /> : <X className="size-3" />}
      {label}
    </span>
  );
}

/** One token: swatch, name, resolved value, and a live contrast grade. */
function Swatch({
  name,
  cssVar,
  note,
  value,
  background,
  grade = "text",
}: {
  name: string;
  cssVar: TokenVar;
  note: string;
  value?: string;
  background?: string;
  /** `text` grades AA body copy, `graphic` grades the 3:1 non-text rule. */
  grade?: "text" | "graphic" | "none";
}) {
  const resolved = value?.trim() ?? "";
  const contrast = grade === "none" ? null : gradeContrast(resolved, background ?? "");

  return (
    <div className="command-panel flex flex-col gap-3 p-4">
      <div
        className="h-14 rounded-sm border border-border"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div>
        <div className="gk-section text-foreground">{name}</div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{cssVar}</div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] tabular-nums text-foreground/80">
          {resolved ? resolved.toUpperCase() : "—"}
        </span>
        {contrast && (
          <GradeChip
            label={
              grade === "graphic"
                ? `${formatRatio(contrast.ratio)} ${contrast.nonText === "pass" ? "UI" : "fail"}`
                : `${formatRatio(contrast.ratio)} ${contrast.text}`
            }
            pass={
              grade === "graphic"
                ? contrast.nonText === "pass"
                : contrast.text === "AA" || contrast.text === "AAA"
            }
          />
        )}
      </div>
    </div>
  );
}

function SwatchGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

function RuleList({ tone, items }: { tone: "do" | "dont"; items: string[] }) {
  return (
    <Card className="p-4">
      <div
        className={cn("gk-section mb-3", tone === "do" ? "text-primary-ink" : "text-destructive")}
      >
        {tone === "do" ? "Do" : "Don't"}
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12px] leading-snug">
            {tone === "do" ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary-ink" />
            ) : (
              <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            )}
            <span className="text-foreground/90">{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const TYPE_SCALE: { role: string; sample: string; className: string; spec: string }[] = [
  {
    role: "Page title",
    sample: "Goalkeeper Intelligence",
    className: "gk-display text-3xl",
    spec: "Be Vietnam Pro 700 · uppercase · -0.014em",
  },
  {
    role: "Section label",
    sample: "Recent activity",
    className: "gk-section",
    spec: "Be Vietnam Pro 600 · 11.5px · 0.055em",
  },
  {
    role: "Body",
    sample: "Mentor visits logged against each keeper this month.",
    className: "text-sm",
    spec: "Saira 400 · 14px",
  },
  {
    role: "Nav item",
    sample: "Goalkeepers",
    className: "gk-nav",
    spec: "JetBrains Mono 500 · 12px · 0.1em",
  },
  {
    role: "Stat label",
    sample: "Reports this week",
    className: "gk-stat-label",
    spec: "JetBrains Mono 400 · 10px · 0.18em",
  },
  {
    role: "Stat value",
    sample: "128",
    className: "gk-stat text-primary-ink",
    spec: "JetBrains Mono 700 · 30px · tabular",
  },
];

const RADII: { name: string; token: string; px: string; use: string }[] = [
  { name: "sm", token: "--radius-sm", px: "5px", use: "badges, pills, chips" },
  { name: "md", token: "--radius-md", px: "7px", use: "buttons, inputs" },
  { name: "lg", token: "--radius-lg", px: "12px", use: "nav items, panels" },
  { name: "xl", token: "--radius-xl", px: "16px", use: "cards, dialogs, sheets" },
];

export function GkhqDesignSystemPage() {
  const { theme, toggle } = useTheme();
  const tokens = useThemeTokens();
  const background = tokens["--background"] ?? "";
  const card = tokens["--card"] ?? "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="GKHQ Design System"
        description="The shared token set behind Mentor Hub and GKHQ Scouting Hub. Every swatch, sample and contrast grade on this page is read from the live theme, so it audits itself."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </Button>
          </div>
        }
      />

      <section className="mb-10">
        <SectionTitle>The System</SectionTitle>
        <Card className="p-5">
          <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">
            Carbon surfaces carry the product, GK Green{" "}
            <span className="font-mono text-primary-ink">#12C400</span> is the only accent, and
            colour never does two jobs at once.{" "}
            <strong className="font-semibold">Traffic light</strong> — green, amber, red — reports
            health and urgency. <strong className="font-semibold">Tags</strong> — blue, magenta,
            ember — classify. A tag never means a state, and a state never means a category.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-panel p-3">
              <div className="gk-stat-label">Themes</div>
              <p className="mt-1 text-[12px] leading-snug text-foreground/90">
                Dark is the default. Light is opt-in. Print applies automatically when a page is
                printed, so dossiers and match reports come out on clean white.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-panel p-3">
              <div className="gk-stat-label">Surfaces</div>
              <p className="mt-1 text-[12px] leading-snug text-foreground/90">
                Hairline borders, not shadows. Depth comes from the carbon step scale and a 2.5%
                inset highlight, never from a drop shadow.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-panel p-3">
              <div className="gk-stat-label">Motion</div>
              <p className="mt-1 text-[12px] leading-snug text-foreground/90">
                140ms on hover, 220ms for panels, one easing curve, no bounce. Reduced-motion
                preferences switch it off entirely.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="mb-10">
        <SectionTitle>Brand &amp; Surfaces</SectionTitle>
        <SwatchGrid>
          <Swatch
            name="Primary"
            cssVar="--primary"
            note="GK Green. One primary action per screen; always black text on the fill."
            value={tokens["--primary"]}
            background={background}
            grade="graphic"
          />
          <Swatch
            name="Primary ink"
            cssVar="--primary-ink"
            note="The text-grade green. Use this for accent copy and links, never the fill."
            value={tokens["--primary-ink"]}
            background={background}
          />
          <Swatch
            name="Background"
            cssVar="--background"
            note="Carbon black. The page floor everything else sits on."
            value={tokens["--background"]}
            grade="none"
          />
          <Swatch
            name="Card"
            cssVar="--card"
            note="One surface step up. Panels go a step further with --panel."
            value={tokens["--card"]}
            grade="none"
          />
          <Swatch
            name="Foreground"
            cssVar="--foreground"
            note="Cloud Dancer. Body and heading copy."
            value={tokens["--foreground"]}
            background={background}
          />
          <Swatch
            name="Muted"
            cssVar="--muted-foreground"
            note="Secondary copy. Mentor Hub holds this above AA, so it can carry sentences."
            value={tokens["--muted-foreground"]}
            background={background}
          />
          <Swatch
            name="Border"
            cssVar="--border"
            note="The hairline. Structure comes from this, not from shadow."
            value={tokens["--border"]}
            grade="none"
          />
          <Swatch
            name="Raised"
            cssVar="--carbon-raised"
            note="Top of the carbon step scale, used by the `raised` utility."
            value={tokens["--carbon-raised"]}
            grade="none"
          />
        </SwatchGrid>
      </section>

      <section className="mb-10">
        <SectionTitle>Traffic Light — state only</SectionTitle>
        <SwatchGrid>
          <Swatch
            name="Success"
            cssVar="--success"
            note="Up to date, on target, cleared."
            value={tokens["--success"]}
            background={background}
          />
          <Swatch
            name="Warning"
            cssVar="--warning"
            note="Due soon, approaching a threshold."
            value={tokens["--warning"]}
            background={background}
          />
          <Swatch
            name="Destructive"
            cssVar="--destructive"
            note="Overdue, failed, destructive action."
            value={tokens["--destructive"]}
            background={background}
          />
          <Swatch
            name="Neutral"
            cssVar="--neutral"
            note="Not required, or not enough data to judge."
            value={tokens["--neutral"]}
            background={background}
          />
        </SwatchGrid>
      </section>

      <section className="mb-10">
        <SectionTitle>Tags — category only</SectionTitle>
        <SwatchGrid>
          <Swatch
            name="Info"
            cssVar="--info"
            note="Signal blue. Informational classification, never a state."
            value={tokens["--info"]}
            background={background}
          />
          <Swatch
            name="Flux"
            cssVar="--flux-magenta"
            note="Second classification hue for dense tag sets."
            value={tokens["--flux-magenta"]}
            background={background}
          />
          <Swatch
            name="Ember"
            cssVar="--ember-orange"
            note="Third classification hue. Not a warning, despite the heat."
            value={tokens["--ember-orange"]}
            background={background}
          />
          <Swatch
            name="Panel"
            cssVar="--panel"
            note="Tag-bearing surfaces sit on panel, so tint reads against it."
            value={tokens["--panel"]}
            grade="none"
          />
        </SwatchGrid>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Match report", cls: "border-info-line bg-info-fill text-info" },
            { label: "Tier 1", cls: "border-tier-1/40 bg-tier-1/15 text-tier-1" },
            { label: "Academy", cls: "border-flux/40 bg-flux/15 text-flux" },
            { label: "Loan", cls: "border-ember/40 bg-ember/15 text-ember" },
          ].map((tag) => (
            <span
              key={tag.label}
              className={cn(
                "inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium",
                tag.cls,
              )}
            >
              {tag.label}
            </span>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Scales</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="gk-section mb-3">Tier</div>
            <div className="space-y-2">
              {(["--tier-1", "--tier-2", "--tier-3", "--tier-4"] as const).map((v, i) => (
                <div key={v} className="flex items-center gap-3">
                  <span
                    className="size-4 shrink-0 rounded-sm"
                    style={{ backgroundColor: `var(${v})` }}
                  />
                  <span className="gk-nav w-20 shrink-0">Tier {i + 1}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {(tokens[v] ?? "").toUpperCase() || "—"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="gk-section mb-3">Rating heat</div>
            <div className="space-y-2">
              {(
                [
                  ["--rating-elite", "Elite"],
                  ["--rating-strong", "Strong"],
                  ["--rating-average", "Average"],
                  ["--rating-developing", "Developing"],
                  ["--rating-poor", "Poor"],
                ] as const
              ).map(([v, label]) => (
                <div key={v} className="flex items-center gap-3">
                  <span
                    className="size-4 shrink-0 rounded-sm"
                    style={{ backgroundColor: `var(${v})` }}
                  />
                  <span className="gk-nav w-20 shrink-0">{label}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {(tokens[v] ?? "").toUpperCase() || "—"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Type</SectionTitle>
        <Card className="divide-y divide-border">
          {TYPE_SCALE.map((row) => (
            <div
              key={row.role}
              className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <div className="gk-stat-label w-36 shrink-0">{row.role}</div>
              <div className="min-w-0 flex-1">
                <div className={row.className}>{row.sample}</div>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">{row.spec}</div>
            </div>
          ))}
        </Card>
      </section>

      <section className="mb-10">
        <SectionTitle>Radii</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {RADII.map((r) => (
            <div key={r.name} className="command-panel p-4">
              <div
                className="h-12 border border-primary-line bg-primary-fill"
                style={{ borderRadius: `var(${r.token})` }}
              />
              <div className="gk-section mt-3">Radius {r.name}</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {r.token} · {r.px}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{r.use}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Components</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="gk-section mb-3">Buttons</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Log interaction</Button>
              <Button size="sm" variant="outline">
                Cancel
              </Button>
              <Button size="sm" variant="ghost">
                Dismiss
              </Button>
              <Button size="sm" variant="destructive">
                Delete
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              One green button per screen. Green always carries black text.
            </p>
          </Card>

          <Card className="p-4">
            <div className="gk-section mb-3">Stat card</div>
            <div className="command-panel p-4">
              <div className="gk-stat-label">Reports this week</div>
              <div className="gk-stat mt-1 text-primary-ink">128</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="bar-grow h-full w-2/3 rounded-full bg-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="gk-section mb-3">Duty state</div>
            <div className="space-y-2">
              {(
                [
                  ["Up to date", "bg-success", "border-success-line bg-success-fill text-success"],
                  ["Due soon", "bg-warning", "border-warning-line bg-warning-fill text-warning"],
                  [
                    "Overdue",
                    "bg-destructive",
                    "border-destructive-line bg-destructive-fill text-destructive",
                  ],
                ] as const
              ).map(([label, dot, chip]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full ring-2 ring-background", dot)} />
                  <span
                    className={cn(
                      "inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium",
                      chip,
                    )}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="gk-section mb-3">Surfaces</div>
            <div className="space-y-2">
              <div className="rounded-lg border border-border bg-card p-3 text-[12px]">
                Card — <code className="font-mono text-[11px]">bg-card</code>
              </div>
              <div className="rounded-lg border border-border bg-panel p-3 text-[12px]">
                Panel — <code className="font-mono text-[11px]">bg-panel</code>
              </div>
              <div className="raised rounded-lg border border-border p-3 text-[12px]">
                Raised — <code className="font-mono text-[11px]">raised</code>
              </div>
              <div className="command-panel p-3 text-[12px]">
                Command panel — square, hairline, tints on hover
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Rules of Engagement</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <RuleList
            tone="do"
            items={[
              "Keep one primary green action per screen — the next thing to do.",
              "Set accent copy in --primary-ink; keep --primary for fills, rails and bars.",
              "Use traffic-light colour only for health and urgency.",
              "Set every number, ID and timestamp in mono, tabular, so columns line up.",
              "Reach for a hairline border before a shadow.",
            ]}
          />
          <RuleList
            tone="dont"
            items={[
              "Never put white text on GK Green — it carries black.",
              "Never use a tag hue to signal a state, or a traffic-light hue to classify.",
              "Never fill a large area flat green; the accent directs, it doesn't decorate.",
              "Never introduce a hex outside the token set — add a token instead.",
              "Never let motion bounce, and never ignore reduced-motion preferences.",
            ]}
          />
        </div>
      </section>

      <section>
        <SectionTitle>Adoption</SectionTitle>
        <Card className="p-5">
          <ul className="space-y-2 text-[12.5px] leading-relaxed text-foreground/90">
            <li>
              Tokens live in <code className="font-mono text-[11px]">src/styles.css</code> and are
              mapped through <code className="font-mono text-[11px]">@theme inline</code>, so every
              component inherits the system without touching its markup.
            </li>
            <li>
              Fonts load from Google Fonts in{" "}
              <code className="font-mono text-[11px]">src/routes/__root.tsx</code>: Be Vietnam Pro
              for display, Saira for interface text, JetBrains Mono for data.
            </li>
            <li>
              The older Volt Signal aliases (
              <code className="font-mono text-[11px]">--accent-volt</code>,{" "}
              <code className="font-mono text-[11px]">--accent-ink</code>) now resolve to the GKHQ
              primary family, so screens built against them moved across unchanged.
            </li>
            <li>
              Printing any page swaps in the print theme automatically — check a match report with
              the Print button above before shipping a change to report layout.
            </li>
          </ul>
          <p className="mt-4 font-mono text-[10px] text-muted-foreground">
            Card surface in this theme: {(card || "—").toUpperCase()}
          </p>
        </Card>
      </section>
    </div>
  );
}
