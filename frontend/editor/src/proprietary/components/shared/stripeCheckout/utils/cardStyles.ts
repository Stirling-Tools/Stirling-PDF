import { CSSProperties, KeyboardEvent } from "react";

/**
 * Shared styling utilities for plan cards
 */

export const CARD_MIN_HEIGHT = "400px";
export const PRICE_FONT_WEIGHT = 600;

/**
 * Get card border style based on state
 */
export function getCardBorderStyle(isHighlighted: boolean): CSSProperties {
  return {
    borderColor: isHighlighted ? "var(--mantine-color-green-6)" : undefined,
    borderWidth: isHighlighted ? "2px" : undefined,
  };
}

/**
 * Get base card style
 */
export function getBaseCardStyle(
  isHighlighted: boolean = false,
): CSSProperties {
  return {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    minHeight: CARD_MIN_HEIGHT,
    ...getCardBorderStyle(isHighlighted),
  };
}

/**
 * Get clickable paper style
 */
export function getClickablePaperStyle(
  isHighlighted: boolean = false,
): CSSProperties {
  return {
    cursor: "pointer",
    transition: "all 0.2s",
    height: "100%",
    position: "relative",
    ...getCardBorderStyle(isHighlighted),
  };
}

/**
 * Semantics for a card that is itself the control. `getClickablePaperStyle`
 * only makes a card *look* clickable; without these a Paper with an onClick is
 * a div, so the choice cannot be reached or made by keyboard.
 */
export function getClickableCardProps(onActivate: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
