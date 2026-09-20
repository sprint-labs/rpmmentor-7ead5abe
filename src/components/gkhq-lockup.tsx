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
export function GkhqWordmark({
  className,
  wrapperClassName,
  alt = "GKHQ",
}: {
  className?: string;
  /**
   * Layout and responsive visibility for the pair — anything that decides
   * whether the wordmark shows at all.
   *
   * It is separate from `className` on purpose. `className` reaches both
   * `<img>`s, and a display utility passed there fights the theme switch
   * below: the header passed `hidden sm:block`, tailwind-merge kept that
   * `sm:block` over each image's own `hidden`, and from `sm` up BOTH cuts
   * rendered — the black-on-light one beside the white-on-dark one, which is
   * the ghosted second wordmark seen in light mode.
   */
  wrapperClassName?: string;
  alt?: string;
}) {
  return (
    <span className={cn("inline-flex", wrapperClassName)}>
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
    </span>
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
 * Mark plus wordmark, the full lockup: the G beside the word, never above it.
 *
 * Every surface draws the same arrangement and differs only in how large the
 * pair is set — the header rail small, the sign-in and reset screens large.
 *
 * Callers size the gap through `className` rather than taking the default,
 * because it does not scale with the mark on its own. The mark art is taller
 * than it is wide (996 x 1145), so `object-contain` inside `GkhqMark`'s square
 * box leaves slack at each side that already reads as space between the two;
 * the larger the mark, the more of the gap is spoken for before `gap-*` is
 * applied at all.
 */
export function GkhqLockup({
  className,
  markClassName,
  wordmarkClassName,
  alt = "GKHQ",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  alt?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <GkhqMark className={markClassName} />
      <GkhqWordmark className={wordmarkClassName} alt={alt} />
    </span>
  );
}
