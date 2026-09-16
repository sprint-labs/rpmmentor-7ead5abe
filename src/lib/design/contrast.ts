/**
 * WCAG 2.x contrast math for the accent proposal page.
 *
 * The proposal (/design/accent-proposal) grades its own tokens live against
 * the active theme instead of quoting ratios that can drift, so these
 * helpers only need to understand the plain hex values our theme tokens
 * resolve to. `color-mix()` tokens (soft washes, glows) are decorative and
 * are never contrast-graded.
 */

export type Rgb = [number, number, number];

/** Parse `#rgb` / `#rrggbb` (case-insensitive, surrounding space ok). */
export function parseHexColor(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

/** WCAG relative luminance of an sRGB color. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio (1–21) between two hex colors, or null if unparseable. */
export function contrastRatio(fgHex: string, bgHex: string): number | null {
  const fg = parseHexColor(fgHex);
  const bg = parseHexColor(bgHex);
  if (!fg || !bg) return null;
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const [hi, lo] = lf >= lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastGrade {
  ratio: number;
  /** ≥7 AAA, ≥4.5 AA, ≥3 large-text only, else fail (WCAG 1.4.3/1.4.6). */
  text: "AAA" | "AA" | "AA-large" | "fail";
  /** ≥3 pass for UI components & graphical objects (WCAG 1.4.11). */
  nonText: "pass" | "fail";
}

/** Grade a foreground/background pair against WCAG text & non-text bars. */
export function gradeContrast(fgHex: string, bgHex: string): ContrastGrade | null {
  const ratio = contrastRatio(fgHex, bgHex);
  if (ratio === null) return null;
  return {
    ratio,
    text: ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA-large" : "fail",
    nonText: ratio >= 3 ? "pass" : "fail",
  };
}

/** "5.12:1" — display form used by the proposal's token cards. */
export function formatRatio(ratio: number): string {
  return `${(Math.round(ratio * 100) / 100).toFixed(2)}:1`;
}
