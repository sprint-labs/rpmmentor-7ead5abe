import { cn } from "@/lib/utils";
import { BRAND_MARK_SRC, BRAND_WORDMARK_DARK_SRC, BRAND_WORDMARK_LIGHT_SRC } from "@/lib/brand";

/**
 * The GKHQ wordmark, cut for the surface it sits on.
 *
 * Its "GK" is set in ink rather than in the brand green — black on light,
 * Cloud Dancer on carbon — so one file cannot serve both themes. Both are in
 * the markup and CSS chooses, rather than JavaScript: the theme class is on
 * `<html>` before first paint, so the right cut is there from the first frame
 * and never swaps under the reader.
 *
 * Only one is announced; the other is decorative to a screen reader.
 */
export function GkhqWordmark({ className, alt = "GKHQ" }: { className?: string; alt?: string }) {
  return (
    <>
      <img
        src={BRAND_WORDMARK_LIGHT_SRC}
        alt={alt}
        draggable={false}
        className={cn("block dark:hidden", className)}
      />
      <img
        src={BRAND_WORDMARK_DARK_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}

/** The G-hexagon on its own. Green on transparent, so it reads on either theme. */
export function GkhqMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <img
      src={BRAND_MARK_SRC}
      alt={alt}
      draggable={false}
      className={cn("object-contain", className)}
      aria-hidden={alt ? undefined : "true"}
    />
  );
}

/**
 * Mark plus wordmark, the full lockup.
 *
 * `stacked` is for the sign-in page, where the brand has room to breathe;
 * the inline arrangement is for the header rail.
 */
export function GkhqLockup({
  className,
  markClassName,
  wordmarkClassName,
  stacked = false,
  alt = "GKHQ",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  stacked?: boolean;
  alt?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex",
        stacked ? "flex-col items-start gap-4" : "items-center gap-2.5",
        className,
      )}
    >
      <GkhqMark className={markClassName} />
      <GkhqWordmark className={wordmarkClassName} alt={alt} />
    </span>
  );
}
