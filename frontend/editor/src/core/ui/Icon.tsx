import type { CSSProperties } from "react";

import { COLORLESS_CLASS } from "@app/icons/colorless";
import { DEFAULT_SIZE, STROKE_WIDTH } from "@app/icons/icons.config";
import { ICONS, type IconName } from "@app/icons/icons";

export { DEFAULT_SIZE, ICONS, STROKE_WIDTH, type IconName };

export interface IconProps {
  name: IconName;
  /** Rendered width and height in px, or any CSS length. */
  size?: number | string;
  /** Overrides the app-wide stroke weight. Ignored by brand marks. */
  strokeWidth?: number;
  /** Fills a stroke icon with currentColor, for a toggle's on state. */
  filled?: boolean;
  /** Repoints a brand mark's own colours at currentColor. Stroke icons ignore it. */
  colorless?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; without one the icon is aria-hidden. */
  title?: string;
}

/** Narrows a name-or-node prop: ReactNode includes string, so typeof cannot. */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && Object.hasOwn(ICONS, value);
}

/** Drawn for a name the map cannot resolve, instead of throwing. */
export const MISSING_ICON: IconName = "circle-dashed";

const reported = new Set<string>();

function resolve(name: string): (typeof ICONS)[IconName] {
  if (isIconName(name)) return ICONS[name];
  // Once per name: the same bad value re-renders constantly in a list.
  if (import.meta.env.DEV && !reported.has(name)) {
    reported.add(name);
    console.error(
      `Icon: "${name}" is not in the icon map, drawing the placeholder instead. Fix the name, or add the svg to src/core/icons/svg/ and a line to src/core/icons/icons.ts.`,
    );
  }
  return ICONS[MISSING_ICON];
}

/** The only icon component: every name in src/core/icons/icons.ts. */
export function Icon({
  name,
  size = DEFAULT_SIZE,
  strokeWidth = STROKE_WIDTH,
  filled = false,
  colorless = false,
  className,
  style,
  title,
}: IconProps) {
  const { Component, kind } = resolve(name);
  const brand = kind === "brand";

  return (
    <Component
      data-missing-icon={isIconName(name) ? undefined : name}
      width={size}
      height={size}
      // A brand mark paints itself, so the weight and fill would flatten it.
      {...(brand
        ? {}
        : { strokeWidth, fill: filled ? "currentColor" : "none" })}
      className={
        colorless && brand
          ? [COLORLESS_CLASS, className].filter(Boolean).join(" ")
          : className
      }
      style={style}
      focusable={false}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    />
  );
}
