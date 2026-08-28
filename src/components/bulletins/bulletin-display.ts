import { CalendarClock, Handshake, KanbanSquare, UserRoundSearch } from "lucide-react";

import type { BulletinItem, BulletinKind } from "@/lib/bulletins/schema";

export const BULLETIN_BOARD_META: ReadonlyArray<{
  kind: BulletinKind;
  label: string;
  singular: string;
  description: string;
  icon: typeof CalendarClock;
}> = [
  {
    kind: "daily_update",
    label: "Daily Updates",
    singular: "Daily update",
    description: "Short operational updates that keep the team aligned.",
    icon: CalendarClock,
  },
  {
    kind: "deal",
    label: "Deals",
    singular: "Deal",
    description: "Live club needs and the next action needed to move them on.",
    icon: Handshake,
  },
  {
    kind: "lead",
    label: "Leads",
    singular: "Lead",
    description: "Potential player or club opportunities that need an owner.",
    icon: UserRoundSearch,
  },
  {
    kind: "mandate",
    label: "Mandates",
    singular: "Mandate",
    description: "Active club or player briefs being worked by the team.",
    icon: KanbanSquare,
  },
];

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "short" });

export function boardLabel(kind: BulletinKind): string {
  return BULLETIN_BOARD_META.find((board) => board.kind === kind)?.label ?? kind;
}

export function boardSingular(kind: BulletinKind): string {
  return BULLETIN_BOARD_META.find((board) => board.kind === kind)?.singular ?? "Bulletin";
}

/** Keep stale or hand-edited URL pages inside the server-reported range. */
export function clampBulletinPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pageCount));
}

/** Canonical assignment comes from the FK, never the retained display snapshot. */
export function bulletinOwnerLabel(item: Pick<BulletinItem, "ownerId" | "ownerName">): string {
  return item.ownerId ? item.ownerName || "RPM team member" : "Unassigned";
}

/** Format a calendar date without letting UTC conversion move it by a day. */
export function formatBulletinDate(value: string | null): string {
  if (!value) return "No due date";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = MONTH_FORMATTER.format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)),
  );
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function formatBulletinDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMATTER.format(date);
}
