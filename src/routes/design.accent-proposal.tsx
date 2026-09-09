import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Check, Moon, Sun, Users, X, Zap } from "lucide-react";
import { Card, PageHeader, Pill, SectionTitle, StatCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { formatRatio, gradeContrast, type ContrastGrade } from "@/lib/design/contrast";

export const Route = createFileRoute("/design/accent-proposal")({
  component: AccentProposalPage,
});

/**
 * Accent Proposal — the "Volt Signal" system.
 *
 * A living style-guide page, not a static mock: every swatch, sample and
 * WCAG grade below is rendered from the real tokens in src/styles.css, in
 * whichever theme you are previewing. If a token drifts out of contrast
 * later, this page shows the failure — it audits itself.
 *
 * The system in one line: one accent, two grades. `volt` carries graphic
 * signal (rails, bars, dots, glows); `ink` carries text. Semantic colors
 * (warning / destructive / info) keep their own hues — volt never replaces
 * meaning, it directs attention.
 */

/** CSS custom properties the page reads live from the active theme. */
const TOKEN_VARS = [
  "--accent-volt",
  "--accent-ink",
  "--accent-soft",
  "--accent-edge",
  "--accent-glow",
  "--background",
  "--ring",
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
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border font-mono whitespace-nowrap",
        pass
          ? "bg-accent-soft text-accent-ink border-accent-edge"
          : "bg-destructive/15 text-destructive border-destructive/40",
      )}
    >
      {pass ? <Check className="size-3" /> : <X className="size-3" />}
      {label}
    </span>
  );
}

function TokenCard({
  name,
  cssVar,
  recipe,
  value,
  swatch,
  grades,
}: {
  name: string;
  cssVar: string;
  recipe: string;
  value?: string;
  swatch: ReactNode;
  grades?: ReactNode;
}) {
  const isHex = !!value && value.startsWith("#");
  return (
    <div className="command-panel p-4 flex flex-col gap-3">
      <div className="h-14 rounded-[4px] border border-border overflow-hidden">{swatch}</div>
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.14em] font-mono">{name}</div>
        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{cssVar}</div>
      </div>
      <div className="text-[11px] text-muted-foreground leading-snug">{recipe}</div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-mono tabular-nums text-foreground/80">
          {isHex ? value.toUpperCase() : (value ?? "—")}
        </span>
        {grades}
      </div>
    </div>
  );
}

/** CURRENT / PROPOSED side-by-side sample. */
function CompareCard({
  title,
  caption,
  before,
  after,
}: {
  title: string;
  caption: string;
  before: ReactNode;
  after: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-bold uppercase tracking-[0.14em] font-mono mb-1">{title}</div>
      <p className="text-[11px] text-muted-foreground leading-snug mb-3">{caption}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
            Current
          </div>
          {before}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent-ink font-mono mb-2">
            Proposed
          </div>
          {after}
        </div>
      </div>
    </Card>
  );
}

/** Sidebar nav item mock — mirrors the real AppShell classes for "current". */
function NavSample({ variant }: { variant: "current" | "proposed" }) {
  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar p-2 space-y-0.5">
      <div className="flex min-h-9 items-center gap-2.5 px-3 py-2 rounded-[6px] text-[12.5px] font-semibold uppercase tracking-[0.05em] text-sidebar-foreground/75">
        <Users className="size-4" />
        Mentors
      </div>
      <div
        className={cn(
          "flex min-h-9 items-center gap-2.5 px-3 py-2 text-[12.5px] font-semibold uppercase tracking-[0.05em]",
          variant === "current"
            ? "rounded-[6px] bg-sidebar-accent text-sidebar-accent-foreground"
            : "rounded-r-[6px] accent-rail bg-accent-soft text-accent-ink",
        )}
      >
        <Users className="size-4" />
        Goalkeepers
      </div>
    </div>
  );
}

function RuleList({ tone, items }: { tone: "do" | "dont"; items: string[] }) {
  return (
    <Card className={cn("p-4", tone === "do" ? "accent-rail" : "")}>
      <div
        className={cn(
          "text-xs font-bold uppercase tracking-[0.14em] font-mono mb-3",
          tone === "do" ? "text-accent-ink" : "text-destructive",
        )}
      >
        {tone === "do" ? "Do" : "Don't"}
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12px] leading-snug">
            {tone === "do" ? (
              <Check className="size-3.5 mt-0.5 shrink-0 text-accent-ink" />
            ) : (
              <X className="size-3.5 mt-0.5 shrink-0 text-destructive" />
            )}
            <span className="text-foreground/90">{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AccentProposalPage() {
  const { theme, toggle } = useTheme();
  const tokens = useThemeTokens();

  const inkGrade = gradeContrast(tokens["--accent-ink"] ?? "", tokens["--background"] ?? "");
  const voltGrade = gradeContrast(tokens["--accent-volt"] ?? "", tokens["--background"] ?? "");
  const legacyRingGrade = gradeContrast(tokens["--ring"] ?? "", tokens["--background"] ?? "");

  const inkPassesText = !!inkGrade && (inkGrade.text === "AA" || inkGrade.text === "AAA");
  const voltPassesNonText = !!voltGrade && voltGrade.nonText === "pass";
  const selfCheckPass = inkPassesText && voltPassesNonText;

  const textGradeChip = (grade: ContrastGrade | null) =>
    grade ? (
      <GradeChip
        label={`text ${grade.text} ${formatRatio(grade.ratio)}`}
        pass={grade.text === "AA" || grade.text === "AAA"}
      />
    ) : null;

  const nonTextGradeChip = (grade: ContrastGrade | null) =>
    grade ? (
      <GradeChip label={`non-text ${formatRatio(grade.ratio)}`} pass={grade.nonText === "pass"} />
    ) : null;

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        title="Accent Proposal"
        description="Volt Signal — one accent, two grades. A live proposal rendered from the app's real tokens; flip the theme and every grade below re-audits itself."
        action={
          <div className="flex items-center gap-2">
            <span className="accent-chip">
              <span className="accent-live" aria-hidden="true" />
              Live proposal
            </span>
            <Button variant="outline" size="sm" onClick={toggle}>
              {theme === "dark" ? <Sun /> : <Moon />}
              Preview {theme === "dark" ? "light" : "dark"}
            </Button>
          </div>
        }
      />

      {/* Self-check verdict — computed, not claimed. */}
      <div
        className={cn(
          "command-panel p-4 flex flex-wrap items-center gap-3",
          selfCheckPass ? "accent-rail accent-glow" : "",
        )}
      >
        <Zap className={cn("size-5", selfCheckPass ? "text-accent-volt" : "text-warning")} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-[0.14em] font-mono">
            Self-check · {theme} theme
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {selfCheckPass
              ? "Ink passes WCAG AA text contrast and volt passes the 3:1 non-text bar against the active background."
              : "Grades are computed in the browser — if this does not pass, a token has drifted and the proposal itself is showing the regression."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {textGradeChip(inkGrade)}
          {nonTextGradeChip(voltGrade)}
        </div>
      </div>

      {/* The system, in three rules. */}
      <section>
        <SectionTitle>The System</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              n: "01",
              title: "Signal, not decoration",
              body: "Volt marks the one thing in a region that is live, selected or primary. If everything glows, nothing does — one signal moment per panel.",
            },
            {
              n: "02",
              title: "Two grades, one hue",
              body: "Volt is graphic-grade for rails, bars and dots; ink is text-grade. On carbon they resolve to one value; on paper ink darkens to hold AA, so light mode stops failing quietly.",
            },
            {
              n: "03",
              title: "Semantics keep their hues",
              body: "Warning stays amber, danger stays red, info stays blue. Volt never encodes severity — it directs attention, tiers and duty states are untouched.",
            },
          ].map((rule) => (
            <Card key={rule.n} className="p-4">
              <div className="text-[10px] font-mono text-accent-ink tracking-[0.18em]">
                {rule.n}
              </div>
              <div className="text-sm font-bold mt-1">{rule.title}</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                {rule.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Token board — values and grades read live from the stylesheet. */}
      <section>
        <SectionTitle>Tokens</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <TokenCard
            name="Volt"
            cssVar="--accent-volt"
            recipe="Graphic grade. Rails, bars, live dots, chart emphasis. Must clear 3:1 non-text contrast."
            value={tokens["--accent-volt"]}
            swatch={<div className="size-full" style={{ background: "var(--accent-volt)" }} />}
            grades={nonTextGradeChip(voltGrade)}
          />
          <TokenCard
            name="Ink"
            cssVar="--accent-ink"
            recipe="Text grade. Accent labels, links, emphasised values. Must clear 4.5:1 AA on --background."
            value={tokens["--accent-ink"]}
            swatch={
              <div
                className="size-full grid place-items-center bg-background text-lg font-bold font-mono"
                style={{ color: "var(--accent-ink)" }}
              >
                Aa
              </div>
            }
            grades={textGradeChip(inkGrade)}
          />
          <TokenCard
            name="Soft"
            cssVar="--accent-soft"
            recipe="12–15% volt wash for selected rows, active nav and chips. Decorative — never graded."
            value="volt 12–15% wash"
            swatch={<div className="size-full bg-accent-soft" />}
          />
          <TokenCard
            name="Edge"
            cssVar="--accent-edge"
            recipe="Border tone: 36% volt mixed into --border. Outlines chips and highlighted panels."
            value="volt 36% × border"
            swatch={
              <div className="size-full bg-background p-3">
                <div className="size-full rounded-[4px] border-2 border-accent-edge" />
              </div>
            }
          />
          <TokenCard
            name="Glow"
            cssVar="--accent-glow"
            recipe="45% volt shadow colour for the accent-glow treatment on command panels."
            value="volt 45% shadow"
            swatch={
              <div className="size-full bg-background grid place-items-center">
                <div className="w-3/5 h-6 rounded-[4px] bg-card border border-accent-edge accent-glow" />
              </div>
            }
          />
        </div>
        {legacyRingGrade && legacyRingGrade.nonText === "fail" && (
          <p className="text-[11px] text-muted-foreground mt-3">
            <span className="font-mono text-warning">Why volt exists:</span> the current light-mode
            focus ring <span className="font-mono">--ring</span> ({tokens["--ring"]?.toUpperCase()})
            measures {formatRatio(legacyRingGrade.ratio)} against the background — under the 3:1
            non-text bar. Volt is the same brand green, corrected until it passes.
          </p>
        )}
      </section>

      {/* Applied, side by side with what ships today. */}
      <section>
        <SectionTitle>Applied</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <CompareCard
            title="Sidebar navigation"
            caption="Active state trades the flat neutral block for a volt rail, soft wash and ink label — visible in peripheral vision without adding weight."
            before={<NavSample variant="current" />}
            after={<NavSample variant="proposed" />}
          />
          <CompareCard
            title="Stat tiles"
            caption="The rail gains a soft wash fading into the panel, and the value sits in ink so light mode keeps AA."
            before={<StatCard label="Overdue Interactions" value={4} accent="primary" />}
            after={
              <div className="command-panel accent-rail accent-glow p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                  Overdue Interactions
                </div>
                <div className="mt-1.5 text-3xl font-bold tabular-nums font-mono leading-none text-accent-ink">
                  4
                </div>
              </div>
            }
          />
          <CompareCard
            title="Status chips"
            caption="accent-chip is a single class: soft wash, edge border, ink text — with an optional live-signal dot that respects reduced motion."
            before={
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="success">On duty</Pill>
                <Pill tone="muted">Synced</Pill>
              </div>
            }
            after={
              <div className="flex flex-wrap items-center gap-2">
                <span className="accent-chip">
                  <span className="accent-live" aria-hidden="true" />
                  On duty
                </span>
                <span className="accent-chip">Synced 2m ago</span>
              </div>
            }
          />
          <CompareCard
            title="Secondary actions"
            caption="Primary buttons stay volt-filled. The proposed signal-secondary reads as branded without competing: edge border, ink text, soft hover."
            before={
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Log Interaction</Button>
                <Button size="sm" variant="outline">
                  Export
                </Button>
              </div>
            }
            after={
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Log Interaction</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-accent-edge text-accent-ink hover:bg-accent-soft hover:text-accent-ink"
                >
                  Export
                </Button>
              </div>
            }
          />
        </div>
      </section>

      {/* Rules of engagement. */}
      <section>
        <SectionTitle>Rules of Engagement</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <RuleList
            tone="do"
            items={[
              "Use volt for the active, selected or live element in a region — rails, dots, bars.",
              "Set accent text in ink (text-accent-ink); it is contrast-safe in both themes.",
              "Build chips and highlighted panels from soft + edge so they inherit theme changes.",
              "Keep accent-glow for at most one panel per view — the one demanding attention.",
            ]}
          />
          <RuleList
            tone="dont"
            items={[
              "Don't set body copy or long labels in volt on light surfaces — it is graphic-grade only.",
              "Don't use volt to encode severity; warning, destructive and info keep their hues.",
              "Don't stack accent treatments — a rail plus wash is enough, skip the glow.",
              "Don't hard-code the accent hex in components; use the tokens so themes stay in sync.",
            ]}
          />
        </div>
      </section>

      {/* What adopting this involves. */}
      <section>
        <SectionTitle>Adoption Notes</SectionTitle>
        <Card className="p-4 space-y-3">
          <p className="text-[12px] leading-relaxed text-foreground/90">
            The tokens and utilities in this proposal are additive — nothing shipped changes until a
            component opts in. Suggested order: sidebar active state, then stat-tile rails, then
            chips, each as its own reviewable change.
          </p>
          <ul className="space-y-1.5 text-[12px] text-muted-foreground leading-snug list-disc pl-4">
            <li>
              <span className="font-mono text-foreground/80">Open item:</span> the boot splash uses
              an off-system mint (<span className="font-mono">#00E5A0</span>) baked into the splash
              PNGs — aligning it with volt needs regenerated assets, so it is flagged here rather
              than changed.
            </li>
            <li>
              <span className="font-mono text-foreground/80">Open item:</span> light-mode{" "}
              <span className="font-mono">--ring</span> /{" "}
              <span className="font-mono">--sidebar-primary</span> could move to volt in a follow-up
              once this system is accepted.
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
