import { createElement, type CSSProperties, type ReactElement } from "react";

import {
  DEFAULT_SIZE,
  ICONS,
  STROKE_WIDTH,
  type IconName,
} from "@app/icons/registry.generated";
import type { IconEntry, IconNode } from "@app/icons/types";

export { DEFAULT_SIZE, ICONS, STROKE_WIDTH, type IconName };
export { STIRLING_ICONS } from "@app/icons/stirlingIcons.generated";
export { THIRD_PARTY_ICONS } from "@app/icons/thirdPartyIcons.generated";
export type { IconEntry, IconNode } from "@app/icons/types";

export interface IconProps {
  name: IconName;
  /** Rendered width and height in px, or any CSS length. */
  size?: number | string;
  /** Overrides the app-wide stroke weight. Ignored by brand marks. */
  strokeWidth?: number;
  /** Fills a mono icon with currentColor, for a toggle's on state. */
  filled?: boolean;
  /** Repoints a brand mark's own colours at currentColor. Mono icons ignore it. */
  colorless?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; without one the icon is aria-hidden. */
  title?: string;
}

function renderNode(node: IconNode, key: number): ReactElement {
  const [tag, attrs, children] = node;
  return createElement(
    tag,
    { key, ...attrs },
    children?.length ? children.map(renderNode) : null,
  );
}

// White is a knockout in the mark's body; recolouring it fills the detail in.
const KNOCKOUT = /^(#fff(fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/i;

const PAINTS = ["fill", "stroke"] as const;

// Faintest and strongest a facet may go; the darkest keeps full weight.
const FACET_RANGE = [0.55, 1] as const;

/** WCAG relative luminance of a hex paint; null if it is not one. */
function luminance(paint: string): number | null {
  const hex = paint.trim().replace(/^#/, "");
  const rrggbb =
    hex.length === 3
      ? [...hex].map((c) => c + c).join("")
      : hex.length === 6
        ? hex
        : null;
  if (!rrggbb || !/^[0-9a-f]{6}$/i.test(rrggbb)) return null;
  const linear = (i: number) => {
    const v = parseInt(rrggbb.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(0) + 0.7152 * linear(1) + 0.0722 * linear(2);
}

function eachPaint(
  nodes: readonly IconNode[],
  visit: (paint: string) => void,
): void {
  for (const [, attrs, children] of nodes) {
    for (const attr of PAINTS) {
      const paint = attrs[attr];
      if (paint && paint !== "none" && !KNOCKOUT.test(paint.trim()))
        visit(paint.trim().toLowerCase());
    }
    if (children) eachPaint(children, visit);
  }
}

/** Per-colour opacity, by luminance rank not value: brand palettes cluster too tightly to separate proportionally. */
function facetOpacity(nodes: readonly IconNode[]): Map<string, number> {
  const lum = new Map<string, number>();
  eachPaint(nodes, (paint) => {
    const l = luminance(paint);
    if (l !== null) lum.set(paint, l);
  });
  if (lum.size < 2) return new Map();
  const [faint, strong] = FACET_RANGE;
  const darkestFirst = [...lum].sort((a, b) => a[1] - b[1]);
  const step = (strong - faint) / (darkestFirst.length - 1);
  return new Map(
    darkestFirst.map(([paint], rank) => [
      paint,
      Number((strong - rank * step).toFixed(3)),
    ]),
  );
}

/** Recolours rather than strips, so a mark drawn only in strokes stays visible. */
function recolour(node: IconNode, opacity: Map<string, number>): IconNode {
  const [tag, attrs, children] = node;
  const next: Record<string, string> = { ...attrs };
  for (const attr of PAINTS) {
    const paint = next[attr];
    if (!paint || paint === "none" || KNOCKOUT.test(paint.trim())) continue;
    next[attr] = "currentColor";
    const alpha = opacity.get(paint.trim().toLowerCase());
    if (alpha !== undefined) next.opacity = String(alpha);
  }
  return [tag, next, children?.map((child) => recolour(child, opacity))];
}

function neutralise(nodes: readonly IconNode[]): readonly IconNode[] {
  const opacity = facetOpacity(nodes);
  return nodes.map((node) => recolour(node, opacity));
}

/** Narrows a name-or-node prop: ReactNode includes string, so typeof cannot. */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && Object.hasOwn(ICONS, value);
}

/** Drawn for a name the registry cannot resolve, instead of throwing. */
export const MISSING_ICON: IconName = "circle-dashed";

const reported = new Set<string>();

function resolve(name: string): IconEntry {
  if (isIconName(name)) return ICONS[name];
  // Once per name: the same bad value re-renders constantly in a list.
  if (import.meta.env.DEV && !reported.has(name)) {
    reported.add(name);
    console.error(
      `Icon: "${name}" is not in the registry, drawing the placeholder instead. Every lucide name is bundled, so this is a typo or a name from data that no longer exists. Fix the name, or add an svg to src/core/icons/svg/.`,
    );
  }
  return ICONS[MISSING_ICON];
}

/** The only icon component: every lucide name, plus the svgs in core/icons/svg. */
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
  const entry = resolve(name);

  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      "data-missing-icon": isIconName(name) ? undefined : name,
      width: size,
      height: size,
      viewBox: entry.viewBox,
      ...(entry.mono
        ? {
            fill: filled ? "currentColor" : "none",
            stroke: "currentColor",
            strokeWidth,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
          }
        : {}),
      className,
      style,
      focusable: false,
      "aria-hidden": title ? undefined : true,
      role: title ? "img" : undefined,
      "aria-label": title,
    },
    (colorless && !entry.mono ? neutralise(entry.nodes) : entry.nodes).map(
      renderNode,
    ),
  );
}
