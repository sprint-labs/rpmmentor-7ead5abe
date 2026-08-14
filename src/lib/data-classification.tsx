// Central data-source classification for every route/section shown in GKHQ.
//
// One file is intentionally the ONLY place a route or section is labelled, so
// a reviewer can audit truthfulness in a single read. Classifications are
// applied by the source of the record — never by the viewing user's role.
//
//   live         — sourced from the canonical production backend (or a
//                  verified live integration) at read time.
//   mock         — hard-coded seed data in src/lib/mock-data.ts or similar.
//   transitional — real user input, but the persistence path is not yet
//                  verified end-to-end (currently: Google Sheets submission).
//   unverified   — displayed as if operational but its source or freshness
//                  is not confirmed in this environment.

import type { ReactNode } from "react";
import { AlertTriangle, Database, FlaskConical, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type Classification = "live" | "mock" | "transitional" | "unverified";

/**
 * Route-level classifications for every surface in the app.
 * Sections inside a route may carry their own classification via <DataSourceBadge/>.
 */
export const ROUTE_CLASSIFICATION: Record<string, Classification> = {
  "/": "mock",
  "/goalkeepers": "mock",
  "/goalkeepers/$gkId": "mock",
  "/mentors": "live",
  "/interactions": "mock",
  "/reports": "transitional",
  "/reports/$reportId": "transitional",
  "/media": "unverified",

  "/alerts": "mock",
  "/calendar": "mock",
  "/executive": "mock",
  "/audit": "unverified",
};

interface Meta {
  label: string;
  short: string;
  description: string;
  Icon: typeof AlertTriangle;
  tone: string;
  toneSolid: string;
}

const META: Record<Classification, Meta> = {
  live: {
    label: "Live",
    short: "LIVE",
    description: "Sourced from the canonical production backend at read time.",
    Icon: Database,
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    toneSolid: "bg-emerald-500",
  },
  mock: {
    label: "Preview data",
    short: "MOCK",
    description:
      "Illustrative data seeded locally for interface work. Not real operational records.",
    Icon: FlaskConical,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    toneSolid: "bg-amber-500",
  },
  transitional: {
    label: "Transitional",
    short: "TRANSITIONAL",
    description:
      "Real user input, but the persistence path has not been verified end-to-end in this environment.",
    Icon: AlertTriangle,
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
    toneSolid: "bg-sky-500",
  },
  unverified: {
    label: "Unverified",
    short: "UNVERIFIED",
    description:
      "This surface is displayed as if operational, but its source or freshness is not confirmed.",
    Icon: HelpCircle,
    tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
    toneSolid: "bg-slate-500",
  },
};

export function classificationMeta(c: Classification): Meta {
  return META[c];
}

interface BadgeProps {
  classification: Classification;
  className?: string;
  title?: string;
}

/** Small inline chip next to a section title. Same for every viewer. */
export function DataSourceBadge({ classification, className, title }: BadgeProps) {
  const m = META[classification];
  return (
    <span
      title={title ?? m.description}
      className={cn(
        "inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[10px] font-semibold uppercase tracking-[0.06em] font-mono",
        m.tone,
        className,
      )}
    >
      <m.Icon className="size-3" />
      {m.short}
    </span>
  );
}

interface BannerProps {
  classification: Classification;
  extra?: ReactNode;
  className?: string;
}

const BANNER_HEADING: Record<Classification, string> = {
  live: "Live data source",
  mock: "Preview data — not real operational records",
  transitional: "Transitional data source",
  unverified: "Unverified data source",
};

/** Full-width banner rendered near the top of each classified route. */
export function DataSourceBanner({ classification, extra, className }: BannerProps) {
  if (classification === "live") return null;
  const m = META[classification];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2 text-[12px] leading-snug",
        m.tone,
        className,
      )}
      role="note"
    >
      <m.Icon className="size-4 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold text-[12px] leading-snug">
          {BANNER_HEADING[classification]}
        </div>
        <div className="opacity-90 mt-0.5">{m.description}</div>
        {extra ? <div className="mt-1 opacity-90">{extra}</div> : null}
      </div>
    </div>
  );
}
