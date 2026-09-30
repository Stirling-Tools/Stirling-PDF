import BrandTileDrawing from "@app/assets/brand/mark/brand-tile.svg?react";

interface BrandTileProps {
  /** CSS length. Omit to let the caller's CSS size it. */
  size?: string;
  className?: string;
}

/** The mark in a rounded square. Decorative: call sites carry the accessible name. */
export function BrandTile({ size, className }: BrandTileProps) {
  return (
    <BrandTileDrawing
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden
    />
  );
}
