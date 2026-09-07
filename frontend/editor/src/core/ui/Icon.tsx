import { createElement, type CSSProperties, type ReactElement } from "react";

import {
  DEFAULT_SIZE,
  ICONS,
  STROKE_WIDTH,
  type IconName,
} from "@app/icons/registry.generated";
import type { IconNode } from "@app/icons/types";

// The single entry point for icons: the component lives here beside the other
// primitives, the generated registry and svg sources stay in core/icons.
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
  /** Fills the glyph with the current colour, for the on state of a toggle
   * whose off state is the same outline (a favourited star). Brand marks ignore it. */
  filled?: boolean;
  /** Recolours a brand mark to `currentColor`, so it reads as a neutral glyph
   * beside stroke icons instead of a colour accent. Mono icons ignore it. */
  colorless?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label. Omitting it marks the icon `aria-hidden`, the right
   * default for an icon beside a text label. */
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

/** White is a knockout cut out of the mark's body, not one of its colours:
 * recolouring it too would merge the detail away and leave a solid blob. */
const KNOCKOUT = /^(#fff(fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/i;

const PAINTS = ["fill", "stroke"] as const;

/** Faintest and strongest a facet may go. The darkest facet keeps full weight
 * so the mark reads as loud as the stroke icons beside it. */
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

/** Opacity per source colour, so a multi-tone mark keeps its facets when it
 * collapses to one hue. Spread evenly by luminance *rank*, not by luminance
 * itself: brand palettes cluster (five of Drive's six tones sit within 0.15),
 * and proportional spacing flattens back into a silhouette at 18px. Empty for
 * marks with nothing to separate, which then render flat at full strength. */
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

/** Repoints a brand mark's literal colours at currentColor. Recolours rather
 * than strips, so a mark drawn only in strokes (nextcloud) stays visible. */
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

/** Narrows "a name or your own node" props: ReactNode already includes string,
 * so `typeof x === "string"` yields string rather than IconName. */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && value in ICONS;
}

/** The only way to render an icon. Add one by dropping an svg into
 * src/core/icons/svg/stirling or svg/third-party. */
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
  const entry = ICONS[name];

  if (!entry) {
    // Names can still arrive widened from config or an API: loud in dev,
    // silent in prod rather than breaking the surrounding layout.
    if (import.meta.env.DEV) {
      throw new Error(
        `Icon: "${name}" is not in the registry. Add an svg to src/core/icons/svg/, or list it in EXTRA_NAMES.`,
      );
    }
    return null;
  }

  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
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
