import { Icon } from "@app/ui/Icon";

interface BrandTileProps {
  /** CSS length. Omit to let the caller's CSS size it. */
  size?: string;
  className?: string;
}

/** The mark in a rounded square. Decorative: call sites carry the accessible name. */
export function BrandTile({ size, className }: BrandTileProps) {
  return <Icon name="stirling-tile" size={size} className={className} />;
}
