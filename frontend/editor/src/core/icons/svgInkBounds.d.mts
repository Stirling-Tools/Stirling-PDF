/** Types for svgInkBounds.mjs, which stays plain JS so node can import it without a build step. */
import type { IconNode } from "@app/icons/types";

export interface InkBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function inkBounds(
  nodes: readonly IconNode[],
  options?: { stroke?: boolean },
): InkBox | null;

/** 2x3 affine matrix [a, b, c, d, e, f] for an svg `transform` attribute. */
export function parseTransform(src?: string): number[];
