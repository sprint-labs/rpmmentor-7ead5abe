import { createFileRoute } from "@tanstack/react-router";
import { Command, Plus, Settings2, Sparkles } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BentoGridShowcase } from "@/components/ui/bento-product-features";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/design/bento-features")({
  component: BentoFeaturesPage,
});

/**
 * Bento Features — a reference page for <BentoGridShowcase />.
 *
 * Like /design/gkhq and /design/accent-proposal, this page is a live sample
 * rather than a screenshot: every card below is built from the shared shadcn
 * primitives and the real tokens in src/styles.css, so it follows whichever
 * theme you are previewing. Lift any of the card components into a product
 * surface as-is — the grid itself owns layout only.
 */

/** The three teammates shown on the "Trackers Connected" card. */
const TRACKER_PEOPLE = [
  {
    name: "Amelia Fraser",
    initials: "AF",
    src: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&crop=faces&q=80",
  },
  {
    name: "Priya Raman",
    initials: "PR",
    src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=faces&q=80",
  },
  {
    name: "Tom Okafor",
    initials: "TO",
    src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=faces&q=80",
  },
] as const;

function IntegrationCard() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
          <Sparkles className="h-6 w-6 text-accent-ink" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">Zapier Integration</CardTitle>
        <CardDescription>
          Unlock effortless automation. Your gateway to effortless automation — connect your
          favourite apps, streamline workflows, and supercharge productivity with ease.
        </CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto flex items-center justify-between">
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Configure
        </Button>
        <Switch defaultChecked aria-label="Toggle Zapier integration" />
      </CardFooter>
    </Card>
  );
}

function TrackersCard() {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-between p-6">
        <div>
          <CardTitle className="text-base font-medium">Trackers Connected</CardTitle>
          <CardDescription>03 Active Integrations</CardDescription>
        </div>
        <div className="flex -space-x-2">
          {TRACKER_PEOPLE.map((person) => (
            <Avatar key={person.name} className="h-8 w-8 ring-2 ring-card">
              <AvatarImage src={person.src} alt={person.name} />
              <AvatarFallback className="text-[10px] font-medium">{person.initials}</AvatarFallback>
            </Avatar>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatisticCard() {
  return (
    <Card className="relative h-full w-full overflow-hidden">
      {/* Dotted backdrop, drawn from the active theme's foreground colour. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "radial-gradient(var(--foreground) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <CardContent className="relative z-10 flex h-full items-center justify-center p-6">
        <span className="text-6xl font-bold tracking-tight text-foreground md:text-8xl">10X</span>
      </CardContent>
    </Card>
  );
}

function FocusCard() {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-between gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-medium">Focusing</CardTitle>
            <CardDescription>Productivity Analytics</CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full border-accent-edge text-accent-ink">
            Range Ratio
          </Badge>
        </div>
        <div>
          <span className="text-5xl font-bold tracking-tight md:text-6xl">42%</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Maximum of focus</span>
          <span>Monthly Focus</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductivityCard() {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-end p-6">
        <CardTitle className="text-base font-medium">Team&rsquo;s Productivity</CardTitle>
        <CardDescription>
          Boost your team&rsquo;s efficiency with our next-gen productivity solutions.
        </CardDescription>
      </CardContent>
    </Card>
  );
}

function ShortcutsCard() {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <CardTitle className="text-base font-medium">Shortcut Keys</CardTitle>
          <CardDescription>Faster easier way to access the features.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background font-mono text-xs font-medium text-muted-foreground">
            <Command className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Command</span>
          </kbd>
          <Plus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <kbd className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background font-mono text-xs font-medium text-muted-foreground">
            M
          </kbd>
        </div>
      </CardContent>
    </Card>
  );
}

export function BentoFeaturesPage() {
  return (
    <div className="w-full p-4 md:p-10">
      <div className="mb-8">
        <h1 className="text-center text-4xl font-bold tracking-tight">Product Features</h1>
        <p className="mt-2 text-center text-lg text-muted-foreground">
          Organize, prioritize and control track your tasks more
          <br />
          efficiently in our trusted platform
        </p>
      </div>

      <BentoGridShowcase
        integration={<IntegrationCard />}
        trackers={<TrackersCard />}
        statistic={<StatisticCard />}
        focus={<FocusCard />}
        productivity={<ProductivityCard />}
        shortcuts={<ShortcutsCard />}
      />
    </div>
  );
}
