/**
 * Utility functions for theme detection and styling in D3 charts
 */

export interface ThemeInfo {
  isDark: boolean;
  schemeAttr: string | null | undefined;
  prefersDark: boolean;
}

/**
 * Detects the current theme from various sources
 * @returns ThemeInfo object with theme detection results
 */
export function detectTheme(): ThemeInfo {
  const rootEl =
    typeof document !== "undefined" ? document.documentElement : null;
  const schemeAttr = rootEl?.getAttribute("data-mantine-color-scheme");
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const isDark = schemeAttr ? schemeAttr === "dark" : prefersDark;

  return {
    isDark,
    schemeAttr,
    prefersDark,
  };
}

/**
 * Gets CSS custom properties for chart styling
 * @param isDark Whether the theme is dark
 * @returns Object with CSS custom property values
 */
export function getChartThemeVars(isDark: boolean) {
  return {
    background: "var(--bg-surface)",
    textPrimary: "var(--text-primary)",
    border: isDark ? "1px solid var(--border-subtle)" : "1px solid transparent",
    boxShadow: isDark ? "none" : "var(--shadow-md)",
    inactive: "var(--usage-inactive)",
    cardBorder: "var(--api-keys-card-border)",
  };
}

/**
 * Applies consistent tooltip styling
 * @param tooltipElement The tooltip DOM element
 * @param isDark Whether the theme is dark
 */
export function applyTooltipStyles(
  tooltipElement: HTMLElement,
  isDark: boolean,
) {
  const themeVars = getChartThemeVars(isDark);

  tooltipElement.style.background = themeVars.background;
  tooltipElement.style.color = themeVars.textPrimary;
  tooltipElement.style.border = themeVars.border;
  tooltipElement.style.boxShadow = themeVars.boxShadow;
  tooltipElement.style.padding = "8px 10px";
  tooltipElement.style.fontSize = "12px";
  tooltipElement.style.lineHeight = "1.25";
  tooltipElement.style.borderRadius = "8px";
}
