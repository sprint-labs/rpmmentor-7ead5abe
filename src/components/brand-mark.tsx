import type { ImgHTMLAttributes } from "react";

/**
 * BrandMark — Mentor Hub brand icon (green G-hexagon + double chevron).
 *
 * Rendered from the app bundle, rather than a Lovable-hosted asset, so the
 * mark is available on every deployment host.
 */
export function BrandMark({
  className,
  alt = "Mentor Hub",
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & { alt?: string }) {
  return (
    <img
      src="/icon-192.png"
      alt={alt}
      className={className}
      draggable={false}
      {...props}
    />
  );
}
