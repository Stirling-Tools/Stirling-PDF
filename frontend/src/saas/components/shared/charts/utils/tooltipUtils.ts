/**
 * Utility functions for tooltip positioning and management in D3 charts
 */

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipPositioner {
  positionTooltip: (
    event: MouseEvent,
    tooltip: HTMLElement,
    container: HTMLElement,
  ) => void;
  hideTooltip: (tooltip: HTMLElement) => void;
}

/**
 * Creates a tooltip positioner for the specified position
 * @param position The tooltip position preference
 * @returns TooltipPositioner object with positioning functions
 */
export function createTooltipPositioner(
  position: TooltipPosition,
): TooltipPositioner {
  const positionTooltip = (
    event: MouseEvent,
    tooltip: HTMLElement,
    container: HTMLElement,
  ) => {
    const bounds = container.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;

    // Get tooltip dimensions after content is set
    const tooltipHeight = tooltip.offsetHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const gap = 16; // 1rem gap

    // Position tooltip based on the specified position
    switch (position) {
      case "top":
        tooltip.style.left = `${Math.min(bounds.width - tooltipWidth - 10, Math.max(10, offsetX - tooltipWidth / 2))}px`;
        tooltip.style.top = `${offsetY - tooltipHeight - gap}px`;
        break;
      case "bottom":
        tooltip.style.left = `${Math.min(bounds.width - tooltipWidth - 10, Math.max(10, offsetX - tooltipWidth / 2))}px`;
        tooltip.style.top = `${offsetY + gap}px`;
        break;
      case "left":
        tooltip.style.left = `${Math.max(10, offsetX - tooltipWidth - gap)}px`;
        tooltip.style.top = `${offsetY - tooltipHeight / 2}px`;
        break;
      case "right":
        tooltip.style.left = `${Math.min(bounds.width - tooltipWidth - 10, offsetX + gap)}px`;
        tooltip.style.top = `${offsetY - tooltipHeight / 2}px`;
        break;
    }
  };

  const hideTooltip = (tooltip: HTMLElement) => {
    tooltip.style.opacity = "0";
  };

  return { positionTooltip, hideTooltip };
}

/**
 * Creates a reusable tooltip element with consistent styling
 * @param container The container element to append the tooltip to
 * @returns The created tooltip element
 */
export function createTooltipElement(container: HTMLElement): HTMLElement {
  const tooltip = document.createElement("div");
  tooltip.style.position = "absolute";
  tooltip.style.left = "0";
  tooltip.style.top = "0";
  tooltip.style.pointerEvents = "none";
  tooltip.style.opacity = "0";
  tooltip.style.transition = "opacity 120ms ease";
  tooltip.style.zIndex = "1000";

  container.appendChild(tooltip);
  return tooltip;
}
