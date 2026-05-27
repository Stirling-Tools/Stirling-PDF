/**
 * Stirling design tokens.
 *
 * Two parallel palettes (light + dark) plus a never-theme-switched CODE palette
 * for syntax-highlighted blocks. Category accents are intentionally identical
 * across both themes — the document types they represent are stable concepts,
 * so their colour is part of their identity rather than a UI affordance.
 *
 * tokens.css is the runtime source of truth — every component reads the CSS
 * custom properties, which flip under `[data-theme="dark"]`. These TS constants
 * are a partial mirror retained for the values consumed in TS (currently the
 * tier mapping below); keep any values here in sync with tokens.css.
 */

export type ColorMode = "light" | "dark";
export type Tier = "free" | "pro" | "enterprise";

export interface ColorPalette {
  // Text hierarchy
  text1: string;
  text2: string;
  text3: string;
  text4: string;
  text5: string;
  text6: string;
  textMuted: string;
  textPlaceholder: string;

  // Brand / status
  blue: string;
  blueDark: string;
  blueLight: string;
  blueBorder: string;
  purple: string;
  purpleLight: string;
  purpleBorder: string;
  green: string;
  greenLight: string;
  greenBorder: string;
  greenDark: string;
  red: string;
  redLight: string;
  redBorder: string;
  amber: string;
  amberLight: string;
  amberBorder: string;
  amberDark: string;

  // Document category accents
  insurance: string;
  compliance: string;
  finance: string;
  legal: string;
  healthcare: string;
  government: string;
  operations: string;
  hr: string;
  realestate: string;
  energy: string;

  // Surface / border
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderLight: string;
  borderInput: string;
  borderHover: string;
  divider: string;
  bgSubtle: string;
  bgHover: string;
  bgMuted: string;
  bgCode: string;

  // Code / tooltips / dropdowns
  codeBg: string;
  codeText: string;
  dropdownBg: string;
  dropdownBorder: string;
  dropdownHover: string;
  tooltipBg: string;
  tooltipText: string;

  // Navigation
  navActive: string;
  navActiveText: string;
  navText: string;
  navHover: string;
  navHoverText: string;
  sectionLabel: string;
  logoText: string;

  // Header
  headerBg: string;
  headerBorder: string;
  headerText: string;
  searchBg: string;
  searchBorder: string;
  searchBorderHover: string;
  searchText: string;

  // Badges / notifications / tier switcher / bell
  badgeBg: string;
  badgeBorder: string;
  badgeRed: string;
  notifBg: string;
  notifBorder: string;
  notifItemBorder: string;
  notifItemHover: string;
  notifTitle: string;
  notifDesc: string;
  notifTime: string;
  tierBtnBg: string;
  tierBtnBorder: string;
  tierBtnText: string;
  tierBtnHover: string;
  bellHover: string;
  bellStroke: string;

  // Sidebar
  sidebarBg: string;
  sidebarBorder: string;
  sidebarDivider: string;
  usageText: string;
  usageValue: string;
  usageTrack: string;

  toggleOff: string;
}

export const COLORS_LIGHT: ColorPalette = {
  text1: "#0f172a",
  text2: "#1a202c",
  text3: "#475569",
  text4: "#64748b",
  text5: "#64748b",
  text6: "#6b7280",
  textMuted: "#8b92a1",
  textPlaceholder: "#9ca3af",

  blue: "#3B82F6",
  blueDark: "#2563eb",
  blueLight: "#eff6ff",
  blueBorder: "#bfdbfe",
  purple: "#8B5CF6",
  purpleLight: "#f5f3ff",
  purpleBorder: "#ddd6fe",
  green: "#10b981",
  greenLight: "#ecfdf5",
  greenBorder: "#a7f3d0",
  greenDark: "#16a34a",
  red: "#ef4444",
  redLight: "#fee2e2",
  redBorder: "#fecaca",
  amber: "#f59e0b",
  amberLight: "#fef3c7",
  amberBorder: "#fde68a",
  amberDark: "#92400e",

  insurance: "#0ea5e9",
  compliance: "#6366f1",
  finance: "#10b981",
  legal: "#3B82F6",
  healthcare: "#8B5CF6",
  government: "#dc2626",
  operations: "#ec4899",
  hr: "#f59e0b",
  realestate: "#84cc16",
  energy: "#f97316",

  bg: "#f8f9fb",
  bgAlt: "#f6f8fa",
  surface: "#ffffff",
  surfaceAlt: "#ffffff",
  border: "#e3e8ee",
  borderLight: "#eef0f2",
  borderInput: "#e2e8f0",
  borderHover: "#cbd5e1",
  divider: "#f0f0f0",
  bgSubtle: "#f9fafb",
  bgHover: "#f8fafc",
  bgMuted: "#f3f4f6",
  bgCode: "#f1f5f9",

  codeBg: "#f1f5f9",
  codeText: "#0f172a",
  dropdownBg: "#ffffff",
  dropdownBorder: "#e5e7eb",
  dropdownHover: "#f9fafb",
  tooltipBg: "#1e293b",
  tooltipText: "#f8fafc",

  navActive: "#eff6ff",
  navActiveText: "#3B82F6",
  navText: "#4b5563",
  navHover: "#f6f8fa",
  navHoverText: "#1a202c",
  sectionLabel: "#9ca3af",
  logoText: "#111827",

  headerBg: "#ffffff",
  headerBorder: "#f0f0f0",
  headerText: "#111827",
  searchBg: "#f9fafb",
  searchBorder: "#e5e7eb",
  searchBorderHover: "#d1d5db",
  searchText: "#9ca3af",

  badgeBg: "#ffffff",
  badgeBorder: "#e5e7eb",
  badgeRed: "#ef4444",
  notifBg: "#ffffff",
  notifBorder: "#e5e7eb",
  notifItemBorder: "#f9fafb",
  notifItemHover: "#fafbfc",
  notifTitle: "#111827",
  notifDesc: "#6b7280",
  notifTime: "#9ca3af",
  tierBtnBg: "#f9fafb",
  tierBtnBorder: "#e5e7eb",
  tierBtnText: "#374151",
  tierBtnHover: "#f3f4f6",
  bellHover: "#f3f4f6",
  bellStroke: "#374151",

  sidebarBg: "#ffffff",
  sidebarBorder: "#e5e7eb",
  sidebarDivider: "#f0f0f0",
  usageText: "#6b7280",
  usageValue: "#374151",
  usageTrack: "#f3f4f6",

  toggleOff: "#cbd5e1",
};

export const COLORS_DARK: ColorPalette = {
  text1: "#f1f5f9",
  text2: "#e2e8f0",
  text3: "#94a3b8",
  text4: "#64748b",
  text5: "#7c869a",
  text6: "#94a3b8",
  textMuted: "#64748b",
  textPlaceholder: "#475569",

  blue: "#60a5fa",
  blueDark: "#3b82f6",
  blueLight: "#1e293b",
  blueBorder: "#1e3a5f",
  purple: "#a78bfa",
  purpleLight: "#1e1b2e",
  purpleBorder: "#2e2650",
  green: "#34d399",
  greenLight: "#0d2818",
  greenBorder: "#065f46",
  greenDark: "#22c55e",
  red: "#f87171",
  redLight: "#2d1215",
  redBorder: "#7f1d1d",
  amber: "#fbbf24",
  amberLight: "#2d2006",
  amberBorder: "#78350f",
  amberDark: "#f59e0b",

  // Category accents — intentionally identical across themes; document
  // categories are stable concepts, not mode-aware UI.
  insurance: "#0ea5e9",
  compliance: "#6366f1",
  finance: "#10b981",
  legal: "#3B82F6",
  healthcare: "#8B5CF6",
  government: "#dc2626",
  operations: "#ec4899",
  hr: "#f59e0b",
  realestate: "#84cc16",
  energy: "#f97316",

  bg: "#090c14",
  bgAlt: "#0d1120",
  surface: "#151c2e",
  surfaceAlt: "#1c2640",
  border: "#283248",
  borderLight: "#1e2840",
  borderInput: "#2e3c55",
  borderHover: "#3d4f6a",
  divider: "#1e2840",
  bgSubtle: "#111827",
  bgHover: "#1c2640",
  bgMuted: "#243044",
  bgCode: "#0b0f1a",

  codeBg: "#0b0f1a",
  codeText: "#e2e8f0",
  dropdownBg: "#151c2e",
  dropdownBorder: "#2e3c55",
  dropdownHover: "#1c2640",
  tooltipBg: "#e2e8f0",
  tooltipText: "#0f172a",

  navActive: "#172044",
  navActiveText: "#60a5fa",
  navText: "#94a3b8",
  navHover: "#1c2640",
  navHoverText: "#e2e8f0",
  sectionLabel: "#475569",
  logoText: "#f1f5f9",

  headerBg: "#0d1120",
  headerBorder: "#1e2840",
  headerText: "#f1f5f9",
  searchBg: "#151c2e",
  searchBorder: "#2e3c55",
  searchBorderHover: "#3d4f6a",
  searchText: "#64748b",

  badgeBg: "#151c2e",
  badgeBorder: "#2e3c55",
  badgeRed: "#ef4444",
  notifBg: "#151c2e",
  notifBorder: "#2e3c55",
  notifItemBorder: "#1e2840",
  notifItemHover: "#1c2640",
  notifTitle: "#f1f5f9",
  notifDesc: "#94a3b8",
  notifTime: "#64748b",
  tierBtnBg: "#151c2e",
  tierBtnBorder: "#2e3c55",
  tierBtnText: "#94a3b8",
  tierBtnHover: "#1c2640",
  bellHover: "#1c2640",
  bellStroke: "#94a3b8",

  sidebarBg: "#0d1120",
  sidebarBorder: "#1e2840",
  sidebarDivider: "#1e2840",
  usageText: "#64748b",
  usageValue: "#94a3b8",
  usageTrack: "#1e2840",

  toggleOff: "#3d4f6a",
};

/**
 * Code-block palette. Stays dark in both themes, like Stripe / Vercel.
 * Use these tokens for syntax-highlighted blocks, terminal output, and
 * inline code samples — anything where the reader expects "code aesthetics".
 */
export const CODE = {
  bg: "#0f172a",
  bgAlt: "#1e293b",
  bgHeader: "#1a2332",
  text: "#e2e8f0",
  dim: "#64748b",
  muted: "#94a3b8",
  keyword: "#60a5fa",
  string: "#fbbf24",
  number: "#c084fc",
  fn: "#34d399",
  type: "#f472b6",
  property: "#93c5fd",
  comment: "#475569",
  dot: "#475569",
  border: "#1e293b",
} as const;

/** Gradients shared across both modes (subtle tints). */
export const GRADIENTS = {
  blueBtnLight:
    "linear-gradient(180deg, #5B9BF7 0%, #4C8BF5 50%, #3A7BE8 100%)",
  blueBtnDark: "linear-gradient(180deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)",
  purpleBtn: "linear-gradient(180deg, #a78bfa 0%, #8B5CF6 50%, #7c3aed 100%)",
  greenBtn: "linear-gradient(180deg, #34d399 0%, #10b981 50%, #059669 100%)",
  bannerLight: "linear-gradient(135deg, #eef2ff 0%, #ddd6fe 50%, #fce7f3 100%)",
  bannerDark: "linear-gradient(135deg, #0f172a 0%, #111827 50%, #1a1535 100%)",
} as const;

export const SHADOWS = {
  light: {
    sm: "inset 0 0 0 0.0625rem #e3e8ee",
    md: "inset 0 0 0 0.0625rem #e3e8ee, 0 0.0625rem 0.125rem rgba(15,23,42,0.04)",
    lg: "inset 0 0 0 0.0625rem #e3e8ee, 0 0.25rem 0.75rem rgba(15,23,42,0.06)",
    blue: "0 0.0625rem 0.125rem rgba(59,130,246,0.25), inset 0 0.0625rem 0 rgba(255,255,255,0.2)",
    blueHover:
      "0 0.125rem 0.375rem rgba(59,130,246,0.3), inset 0 0.0625rem 0 rgba(255,255,255,0.25)",
  },
  dark: {
    sm: "inset 0 0 0 0.0625rem #283248",
    md: "inset 0 0 0 0.0625rem #283248, 0 0.0625rem 0.1875rem rgba(0,0,0,0.3)",
    lg: "inset 0 0 0 0.0625rem #283248, 0 0.5rem 1.5rem rgba(0,0,0,0.4)",
    blue: "0 0.0625rem 0.1875rem rgba(59,130,246,0.35), inset 0 0.0625rem 0 rgba(255,255,255,0.1)",
    blueHover:
      "0 0.125rem 0.5rem rgba(59,130,246,0.45), inset 0 0.0625rem 0 rgba(255,255,255,0.15)",
  },
} as const;

/** Radii (px). */
export const RADII = {
  xs: 3,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: "50%" as const,
  pill: 10,
} as const;

/** Typography. */
export const TYPE = {
  fontSans:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  fontMono:
    '"SF Mono", "Fira Code", Menlo, Consolas, "DejaVu Sans Mono", monospace',
  fontBrand: '"Alumni Sans", "Inter", sans-serif',
} as const;

/** Motion. */
export const MOTION = {
  fast: "0.15s ease",
  base: "0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "0.3s ease",
  // Component-level easings
  enter: "0.22s cubic-bezier(0.4, 0, 0.2, 1)",
  exit: "0.18s cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Returns the resolved palette for a given mode. */
export function palette(mode: ColorMode): ColorPalette {
  return mode === "dark" ? COLORS_DARK : COLORS_LIGHT;
}

/** Tier visual mapping — used by the tier switcher and sidebar plan indicator. */
export const TIER_INFO: Record<
  Tier,
  { label: string; dotColor: string; chipColor: string }
> = {
  free: {
    label: "Free Plan",
    dotColor: COLORS_LIGHT.green,
    chipColor: COLORS_LIGHT.greenLight,
  },
  pro: {
    label: "Pay-as-you-go",
    dotColor: COLORS_LIGHT.blue,
    chipColor: COLORS_LIGHT.blueLight,
  },
  enterprise: {
    label: "Enterprise Plan",
    dotColor: COLORS_LIGHT.purple,
    chipColor: COLORS_LIGHT.purpleLight,
  },
};
