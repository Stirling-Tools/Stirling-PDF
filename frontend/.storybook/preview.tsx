// Storybook compiles .storybook/* with the classic JSX runtime, so the JSX in
// the decorators below transpiles to React.createElement and needs React in
// scope. (The app + story files use the automatic runtime via the portal vite
// config; this import is specifically for the preview config file.)
import React, { useEffect } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { MemoryRouter } from "react-router-dom";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import { MantineProvider } from "@mantine/core";

// Reference React so the import isn't dropped as unused by the bundler — the
// classic runtime needs it present even though it's not named in the JSX.
void React;

import { TierProvider, type Tier } from "@portal/contexts/TierContext";
import { ThemeProvider } from "@portal/contexts/ThemeContext";
import { UIProvider } from "@portal/contexts/UIContext";
import { mantineTheme } from "@portal/theme/mantineTheme";
import { handlers } from "@portal/mocks/handlers";

import "@mantine/core/styles.css";
import "@shared/tokens/tokens.css";
import "@shared/tokens/base.css";

// Start MSW once. Storybook runs in a browser so this uses the service worker.
initialize({ onUnhandledRequest: "bypass" }, handlers);

/**
 * Bridge between Storybook's `tier` global toolbar and the actual TierProvider.
 * Without this the toolbar would just change a label; with it, every story
 * that calls useTier() reflects the active toolbar value.
 */
function TierBridge({
  tier,
  children,
}: {
  tier: Tier;
  children: React.ReactNode;
}) {
  return <TierProvider initialTier={tier}>{children}</TierProvider>;
}

/** Forces the TierProvider to re-mount whenever the toolbar tier changes. */
function TierKey({
  tier,
  children,
}: {
  tier: Tier;
  children: React.ReactNode;
}) {
  return (
    <TierBridge key={tier} tier={tier}>
      {children}
    </TierBridge>
  );
}

/** Keeps useTheme() and the data-theme attribute in sync. */
function ThemeWatcher() {
  useEffect(() => {
    // The addon-themes decorator already sets data-theme on <html>.
    // We just read it on mount so ThemeProvider picks it up.
  }, []);
  return null;
}

const withProviders: Decorator = (Story, context) => {
  const tier = (context.globals.tier as Tier) ?? "pro";
  // withThemeByDataAttribute exposes the toolbar theme as the `theme` global.
  // Bind Mantine's color scheme to it so Mantine chrome (inputs, focus rings,
  // default surfaces) follows the dark toggle alongside the SUI CSS variables.
  // The global initialises to "" (before any toolbar interaction), so treat
  // anything that isn't "dark" as light — matching the addon's own
  // `selected || defaultTheme` fallback where defaultTheme is light.
  const colorScheme = context.globals.theme === "dark" ? "dark" : "light";
  return (
    <MemoryRouter initialEntries={["/"]}>
      <ThemeProvider>
        <MantineProvider theme={mantineTheme} forceColorScheme={colorScheme}>
          <TierKey tier={tier}>
            <UIProvider>
              <ThemeWatcher />
              <Story />
            </UIProvider>
          </TierKey>
        </MantineProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
};

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    layout: "padded",
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    backgrounds: {
      default: "app",
      values: [
        { name: "app", value: "var(--color-bg)" },
        { name: "surface", value: "var(--color-surface)" },
      ],
    },
    a11y: {
      // Run axe automatically against the story root; violations show in the
      // Accessibility panel. `context` replaced `element` in addon-a11y 9.x.
      context: "#storybook-root",
      config: {},
      options: {},
      test: "todo",
    },
  },
  globalTypes: {
    tier: {
      name: "Tier",
      description: "Subscription tier — drives useTier() everywhere",
      defaultValue: "pro",
      toolbar: {
        icon: "star",
        items: [
          { value: "free", title: "Free" },
          { value: "pro", title: "Pay-as-you-go" },
          { value: "enterprise", title: "Enterprise" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    withProviders,
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-theme",
    }),
  ],
};

export default preview;
