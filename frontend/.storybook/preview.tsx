import type { Decorator, Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";
import { withThemeByDataAttribute } from "@storybook/addon-themes";

import {
  TierProvider,
  useTier,
  type Tier,
} from "@app/contexts/TierContext";
import { ThemeProvider } from "@app/contexts/ThemeContext";
import { UIProvider } from "@app/contexts/UIContext";
import { handlers } from "@app/mocks/handlers";

import "../src/shared/tokens/tokens.css";
import "../src/shared/tokens/base.css";

// Start MSW once. Storybook runs in a browser so this uses the service worker.
initialize(
  { onUnhandledRequest: "bypass" },
  handlers,
);

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
  return (
    <MemoryRouter initialEntries={["/"]}>
      <ThemeProvider>
        <TierKey tier={tier}>
          <UIProvider>
            <ThemeWatcher />
            <Story />
          </UIProvider>
        </TierKey>
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
