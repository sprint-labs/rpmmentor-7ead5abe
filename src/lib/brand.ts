/**
 * Brand assets that must ship with the Vercel build.
 *
 * Do not import `@/assets/*.asset.json` URLs here. Those resolve to Lovable
 * `/__l5e/...` paths, which 404 on rpmmentor.com.
 *
 * The wordmark comes in two cuts because its "GK" is set in ink rather than in
 * the brand green: black reads on light surfaces, Cloud Dancer on carbon. The
 * "HQ" is GK Green in both, so the mark never changes.
 */

/** The G-hexagon, green on transparent. Legible on either theme. */
export const BRAND_MARK_SRC = "/gkhq-mark.png";

/** Wordmark for light surfaces — black "GK". */
export const BRAND_WORDMARK_LIGHT_SRC = "/gkhq-wordmark-light.png";

/** Wordmark for carbon surfaces — Cloud Dancer "GK". */
export const BRAND_WORDMARK_DARK_SRC = "/gkhq-wordmark-dark.png";
