/**
 * A club's badge, for lists where one row of text looks like the next.
 *
 * There is no crest artwork in the product and no column to hold a crest URL,
 * so this draws a monogram instead of pretending otherwise. It is shaped and
 * sized like a crest so that real artwork can replace the letters later
 * without the surrounding layout moving.
 *
 * Always decorative. The club's name is printed beside it everywhere it is
 * used, so announcing the monogram too would just read the same club twice.
 */
import { cn } from "@/lib/utils";
import { clubAccent, clubInitials } from "@/lib/club-identity";
import { clubCrestUrlFor } from "@/lib/club-crest-urls";

/**
 * The categorical ramp, indexed by `clubAccent`.
 *
 * Written out rather than interpolated because Tailwind scans source for whole
 * class names; `border-chart-${n}` produces nothing at build time.
 *
 * The hue is carried by the ring and the rail only. The monogram itself stays
 * in `--foreground`, which keeps it at full contrast in both themes and keeps
 * a club colour from ever being read as a status colour.
 */
const RING = [
  "border-chart-1",
  "border-chart-2",
  "border-chart-3",
  "border-chart-4",
  "border-chart-5",
];
const RAIL = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

/** The rail colour for a card belonging to this club. */
export function clubRail(club: string | null | undefined): string {
  return RAIL[clubAccent(club ?? "") - 1]!;
}

export function ClubCrest({
  club,
  size = "md",
  className,
}: {
  club: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const name = club?.trim() ?? "";
  const crestUrl = clubCrestUrlFor(name);
  const box = cn(
    "grid shrink-0 place-items-center overflow-hidden rounded-md border-2 bg-muted",
    RING[clubAccent(name) - 1],
    size === "sm" ? "size-8" : "size-11",
    className,
  );
  if (crestUrl) {
    return (
      <span aria-hidden="true" className={box}>
        <img src={crestUrl} alt="" className="size-full object-contain p-0.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "font-display font-bold leading-none tracking-tight text-foreground",
        size === "sm" ? "text-[10px]" : "text-xs",
      )}
    >
      {clubInitials(name)}
    </span>
  );
}
