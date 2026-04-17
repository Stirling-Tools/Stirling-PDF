/**
 * Reusable D3 utility functions for chart creation
 */

import * as d3 from "d3";

export interface ChartDimensions {
  width: number;
  height: number;
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}

export interface AnimationConfig {
  duration: number;
  easing?: (t: number) => number;
}

/**
 * Creates a basic SVG element with proper attributes
 * @param container The container element
 * @param dimensions Chart dimensions
 * @param className Optional CSS class name
 * @returns The created SVG selection
 */
export function createSVG(
  container: HTMLElement,
  dimensions: ChartDimensions,
  className?: string,
): d3.Selection<SVGSVGElement, unknown, null, undefined> {
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("height", dimensions.height)
    .attr("viewBox", `0 0 ${dimensions.width} ${dimensions.height}`)
    .attr("class", className || "");

  return svg;
}

/**
 * Creates a clip path for revealing content with animation
 * @param svg The SVG selection
 * @param clipId Unique ID for the clip path
 * @param dimensions Chart dimensions
 * @returns The clip rect selection
 */
export function createClipPath(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  clipId: string,
  dimensions: ChartDimensions,
): d3.Selection<SVGRectElement, unknown, null, undefined> {
  const defs = svg.append("defs");
  const clipRect = defs
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 0)
    .attr("height", dimensions.height);

  return clipRect;
}

/**
 * Animates a clip path to reveal content
 * @param clipRect The clip rect selection
 * @param targetWidth The target width to animate to
 * @param config Animation configuration
 */
export function animateClipReveal(
  clipRect: d3.Selection<SVGRectElement, unknown, null, undefined>,
  targetWidth: number,
  config: AnimationConfig,
): void {
  clipRect
    .transition()
    .duration(config.duration)
    .ease(config.easing || d3.easeCubicInOut)
    .attr("width", targetWidth);
}

/**
 * Creates a rounded rectangle path for D3
 * @param x X position
 * @param y Y position
 * @param width Width
 * @param height Height
 * @param radius Corner radius
 * @param corners Which corners to round (default: all)
 * @returns SVG path string
 */
export function createRoundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  corners: {
    topLeft?: boolean;
    topRight?: boolean;
    bottomLeft?: boolean;
    bottomRight?: boolean;
  } = {},
): string {
  const {
    topLeft = true,
    topRight = true,
    bottomLeft = true,
    bottomRight = true,
  } = corners;

  if (width <= 0 || height <= 0) return "";

  const topLeftRadius = topLeft ? radius : 0;
  const topRightRadius = topRight ? radius : 0;
  const bottomRightRadius = bottomRight ? radius : 0;
  const bottomLeftRadius = bottomLeft ? radius : 0;

  let path = `M ${x + topLeftRadius} ${y}`;

  if (topRight) {
    path += ` L ${x + width - topRightRadius} ${y}`;
    path += ` A ${topRightRadius} ${topRightRadius} 0 0 1 ${x + width} ${y + topRightRadius}`;
  } else {
    path += ` L ${x + width} ${y}`;
  }

  if (bottomRight) {
    path += ` L ${x + width} ${y + height - bottomRightRadius}`;
    path += ` A ${bottomRightRadius} ${bottomRightRadius} 0 0 1 ${x + width - bottomRightRadius} ${y + height}`;
  } else {
    path += ` L ${x + width} ${y + height}`;
  }

  if (bottomLeft) {
    path += ` L ${x + bottomLeftRadius} ${y + height}`;
    path += ` A ${bottomLeftRadius} ${bottomLeftRadius} 0 0 1 ${x} ${y + height - bottomLeftRadius}`;
  } else {
    path += ` L ${x} ${y + height}`;
  }

  if (topLeft) {
    path += ` L ${x} ${y + topLeftRadius}`;
    path += ` A ${topLeftRadius} ${topLeftRadius} 0 0 1 ${x + topLeftRadius} ${y}`;
  } else {
    path += ` L ${x} ${y}`;
  }

  return path + " Z";
}

/**
 * Creates a reusable scale factory
 * @param domain Domain values
 * @param range Range values
 * @returns D3 scale function
 */
export function createScale(domain: [number, number], range: [number, number]) {
  return d3.scaleLinear().domain(domain).range(range);
}

/**
 * Debounces a function call
 * @param func The function to debounce
 * @param wait The wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
