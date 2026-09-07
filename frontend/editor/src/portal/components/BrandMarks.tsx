import type { CSSProperties } from "react";
import { Icon, ICONS, type IconName } from "@app/ui/Icon";

/** Ids whose registry name differs from the id itself. */
const ID_ALIASES: Record<string, IconName> = {
  email: "mail",
};

/** Unknown connector types get a neutral plug rather than nothing. */
const FALLBACK: IconName = "plug";

function markName(id: string): IconName {
  if (id in ID_ALIASES) return ID_ALIASES[id];
  return id in ICONS ? (id as IconName) : FALLBACK;
}

interface BrandMarkProps {
  id: string;
  size?: number | string;
  /** Renders the mark in the current text colour instead of its brand colours,
   * for lists where it sits among stroke icons. */
  colorless?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Brand mark for an integration, connector or source type. Geometry lives in
 * core/icons/svg/; this only resolves an id to a registry name. */
export function BrandMark({
  id,
  size = 20,
  colorless = false,
  className,
  style,
}: BrandMarkProps) {
  return (
    <Icon
      name={markName(id)}
      size={size}
      colorless={colorless}
      className={className}
      style={style}
    />
  );
}
