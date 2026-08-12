import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";

/**
 * Mantine theme for the processor, bound to the SUI design tokens in
 * shared/tokens/tokens.css. This is what lets a Mantine component (e.g. a
 * Combobox we don't want to rebuild in SUI) sit next to a SUI <Card> and look
 * like one system.
 *
 * SUI exposes ~4 named shades per colour (`-light`, `-border`, base, `-dark`),
 * but Mantine requires a 10-slot tuple. `tuple()` spreads the SUI shades across
 * the 10 slots, with index 6 — Mantine's default `filled` shade — landing on
 * the base brand colour. Because every slot is a `var(--color-*)` reference and
 * those variables flip under `[data-theme="dark"]`, the Mantine theme follows
 * SUI's light/dark switch automatically with no extra wiring.
 *
 * Caveat: every shade is a `var(--color-*)` reference, not a literal colour, so
 * Mantine's JS colour maths can't read it. Don't enable `autoContrast` or rely
 * on `theme.fn.lighten/darken/alpha` for these palettes — they need real hex
 * values. CSS `color-mix()` variants work fine.
 */
function tuple(
  light: string,
  border: string,
  base: string,
  dark: string,
): MantineColorsTuple {
  return [
    `var(${light})`, // 0  subtle background
    `var(${light})`, // 1
    `var(${border})`, // 2
    `var(${border})`, // 3
    `var(${base})`, // 4
    `var(${base})`, // 5
    `var(${base})`, // 6  default filled shade
    `var(${dark})`, // 7  hover
    `var(${dark})`, // 8
    `var(${dark})`, // 9
  ];
}

const blue = tuple(
  "--color-blue-light",
  "--color-blue-border",
  "--color-blue",
  "--color-blue-dark",
);
const green = tuple(
  "--color-green-light",
  "--color-green-border",
  "--color-green",
  "--color-green-dark",
);
const red = tuple(
  "--color-red-light",
  "--color-red-border",
  "--color-red",
  "--color-red-dark",
);
const amber = tuple(
  "--color-amber-light",
  "--color-amber-border",
  "--color-amber",
  "--color-amber-dark",
);
const purple = tuple(
  "--color-purple-light",
  "--color-purple-border",
  "--color-purple",
  "--color-purple-dark",
);

/**
 * Maps Mantine's neutral CSS variables to SUI tokens so dropdowns, popovers,
 * and other floating elements follow the SUI surface/border/text palette rather
 * than Mantine's default white/gray-* / dark-* scale.
 *
 * SuiProvider syncs Mantine's color scheme to SUI's light/dark toggle
 * (forceColorScheme), so the light/dark buckets here align with
 * [data-theme="light/dark"] and the SUI token values are correct.
 */
/**
 * Slots Mantine paints text and fills with, written in tokens that flip with
 * the scheme. Both halves take the same map; the dark half was previously
 * empty, leaving those slots on Mantine's stock palette.
 */
const suiAccessibleColorSlots = {
  // Every slot Mantine paints text with defaults to the hue's fill, which is
  // chosen to carry white and is therefore too light to read on a surface.
  // The -dark shades are the SUI tokens meant for ink.
  "--mantine-color-anchor": "var(--color-blue-dark)",
  "--mantine-color-blue-light-color": "var(--color-blue-dark)",
  "--mantine-color-blue-text": "var(--color-blue-dark)",
  "--mantine-color-blue-outline": "var(--color-blue-dark)",
  "--mantine-color-green-light-color": "var(--color-green-dark)",
  "--mantine-color-green-text": "var(--color-green-dark)",
  "--mantine-color-green-outline": "var(--color-green-dark)",
  "--mantine-color-red-light-color": "var(--color-red-dark)",
  "--mantine-color-red-text": "var(--color-red-dark)",
  "--mantine-color-red-outline": "var(--color-red-dark)",
  "--mantine-color-red-filled": "var(--c-danger-solid)",
  "--mantine-color-amber-light-color": "var(--color-amber-dark)",
  "--mantine-color-amber-text": "var(--color-amber-dark)",
  "--mantine-color-amber-outline": "var(--color-amber-dark)",
  "--mantine-color-purple-light-color": "var(--color-purple-dark)",
  "--mantine-color-purple-text": "var(--color-purple-dark)",
  "--mantine-color-purple-outline": "var(--color-purple-dark)",
  "--mantine-color-error": "var(--color-red-dark)",
  "--mantine-color-dimmed": "var(--c-text-muted)",
  // Solid fills that must carry a white label.
  "--mantine-color-blue-filled": "var(--c-accent-solid)",
  // The -dark shades are inks; a fill carrying a white label needs the solid.
  "--mantine-color-purple-filled": "var(--c-accent-solid)",
  "--mantine-color-green-filled": "var(--c-success-solid)",
  "--mantine-color-amber-filled": "var(--c-warning-solid)",
  "--mantine-color-gray-filled": "var(--c-neutral-solid)",
} as const;

export const suiCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--mantine-color-text": "var(--c-text)",
    "--mantine-color-placeholder": "var(--color-text-placeholder)",
    "--mantine-color-body": "var(--c-bg)",
  },
  light: {
    ...suiAccessibleColorSlots,
    // Popover/dropdown background + combobox search input
    "--mantine-color-white": "var(--c-surface)",
    // Option hover background
    "--mantine-color-gray-0": "var(--c-hover)",
    // Dropdown border
    "--mantine-color-gray-2": "var(--c-border)",
  },
  dark: {
    ...suiAccessibleColorSlots,
    // Popover/dropdown background (dark-6 is the floating surface in dark mode)
    "--mantine-color-dark-6": "var(--c-surface)",
    // Deeper background used for option hover + combobox search input
    "--mantine-color-dark-7": "var(--c-bg)",
    // Border in dark mode
    "--mantine-color-dark-4": "var(--c-border)",
  },
});

export const mantineTheme = createTheme({
  primaryColor: "blue",
  // Mantine uses index 6 of the tuple for filled components by default, which
  // is where tuple() places the base brand shade.
  primaryShade: 6,
  colors: {
    blue,
    green,
    red,
    amber,
    purple,
  },
  components: {
    // Icon-only dismiss controls carry no text; name them so screen readers
    // can reach them (see the editor theme for the same defaults).
    CloseButton: { defaultProps: { "aria-label": "Close" } },
    Modal: { defaultProps: { closeButtonProps: { "aria-label": "Close" } } },
    Drawer: { defaultProps: { closeButtonProps: { "aria-label": "Close" } } },
  },
  fontFamily: "var(--font-sans)",
  fontFamilyMonospace: "var(--font-mono)",
  defaultRadius: "var(--radius-md)",
});
