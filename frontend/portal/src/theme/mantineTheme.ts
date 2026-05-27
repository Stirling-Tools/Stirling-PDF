import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * Mantine theme for the portal, bound to the SUI design tokens in
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
  fontFamily: "var(--font-sans)",
  fontFamilyMonospace: "var(--font-mono)",
  defaultRadius: "var(--radius-md)",
});
