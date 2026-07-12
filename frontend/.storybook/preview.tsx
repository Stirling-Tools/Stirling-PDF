// Storybook compiles .storybook/* with the classic JSX runtime, so the JSX in
// the decorators below transpiles to React.createElement and needs React in
// scope. (The app + story files use the automatic runtime via the portal vite
// config; this import is specifically for the preview config file.)
import React, { Suspense, useEffect } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { MemoryRouter } from "react-router-dom";
import { withThemeByDataAttribute } from "@storybook/addon-themes";

// Reference React so the import isn't dropped as unused by the bundler — the
// classic runtime needs it present even though it's not named in the JSX.
void React;

import { TierProvider, type Tier } from "@portal/contexts/TierContext";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { UIProvider } from "@portal/contexts/UIContext";
import { SuiProvider } from "@portal/theme/SuiProvider";
import { deriveAccessiblePrimary } from "@core/utils/customPrimary";
import { DEFAULT_ACCENT_COLOR } from "@core/constants/theme";
import { handlers } from "@portal/mocks/handlers";
import { configureSupabase } from "@proprietary/auth/supabase/supabaseClient";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { parse as parseToml } from "smol-toml";
// Load the real English copy so stories render human text, not raw keys. Bundled
// synchronously via ?raw so it's present on the very first render (no async flash).
import enTranslationToml from "../editor/public/locales/en-US/translation.toml?raw";

import "@mantine/core/styles.css";
import "@core/tokens/tokens.css";
import "@core/theme/index.css";
import "@core/tokens/base.css";

// Storybook-only: init react-i18next with the real English resources parsed from
// the app's TOML, so t(key) renders the shipped copy (e.g. "No sources connected
// yet") rather than the raw key. Falls back to an empty bundle if parsing ever
// fails, so a malformed TOML can't take the whole Storybook down.
function parseEnTranslation(): Record<string, unknown> {
  try {
    return parseToml(enTranslationToml) as Record<string, unknown>;
  } catch {
    return {};
  }
}

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: parseEnTranslation() } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// Start MSW once. Storybook runs in a browser so this uses the service worker.
initialize({ onUnhandledRequest: "bypass" }, handlers);

// Storybook-only: stub a SaaS session so apiClient.saas reads (invoices, payment
// method, wallet) clear the session check and reach the MSW handlers instead of
// failing with "No SaaS session". VITE_SUPABASE_URL/KEY are defined empty (see
// .storybook/main.ts), so ensureSaasSupabase() is a no-op and never replaces this
// client; only VITE_SAAS_API_URL (a mock origin MSW matches) is configured —
// injected via .storybook/main.ts's viteFinal define, not a frontend/.env file.
const saasStub = configureSupabase({
  url: "http://saas.mock",
  key: "storybook-anon-key",
  authOptions: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
saasStub.auth.getSession = async () =>
  ({
    data: { session: { access_token: "storybook-fake-jwt" } },
    error: null,
  }) as Awaited<ReturnType<typeof saasStub.auth.getSession>>;

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

/**
 * Makes the Storybook toolbar the SINGLE source of truth for the theme.
 */
function ThemeBridge({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);
  return <>{children}</>;
}

/**
 * Tints the canvas from the toolbar accent picker (see .storybook/manager.tsx),
 * exactly like the editor: always `data-app-theme="custom"`, with
 * --user-primary/-on/-accent-fg derived from the active mode's accent global.
 */
function AccentInjector({
  scheme,
  accent,
}: {
  scheme: "light" | "dark";
  accent: string;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-app-theme", "custom");
    root.setAttribute("data-mantine-color-scheme", scheme);
    const { primary, onPrimary, accentForeground } = deriveAccessiblePrimary(
      accent,
      scheme,
    );
    root.style.setProperty("--user-primary", primary);
    root.style.setProperty("--user-primary-on", onPrimary);
    root.style.setProperty("--user-accent-fg", accentForeground);
  }, [scheme, accent]);
  return null;
}

const withProviders: Decorator = (Story, context) => {
  const tier = (context.globals.tier as Tier) ?? "pro";
  const linkState =
    (context.globals.linkState as LinkState) ?? "linked-subscribed";
  // withThemeByDataAttribute exposes the toolbar theme as the `theme` global.
  // Bind Mantine's color scheme to it so Mantine chrome (inputs, focus rings,
  // default surfaces) follows the dark toggle alongside the SUI CSS variables.
  // The global initialises to "" (before any toolbar interaction), so treat
  // anything that isn't "dark" as light — matching the addon's own
  // `selected || defaultTheme` fallback where defaultTheme is light.
  const colorScheme = context.globals.theme === "dark" ? "dark" : "light";
  // Each mode has its own accent (set by the toolbar accent picker).
  const accent =
    (colorScheme === "dark"
      ? (context.globals.accentDark as string)
      : (context.globals.accentLight as string)) ?? DEFAULT_ACCENT_COLOR;
  return (
    <MemoryRouter initialEntries={["/"]}>
      <ThemeProvider>
        <AccentInjector scheme={colorScheme} accent={accent} />
        <ThemeBridge theme={colorScheme}>
          <SuiProvider colorScheme={colorScheme}>
            {/* LinkProvider must wrap TierProvider: TierContext derives its tier
                from useLink() (matches App.tsx's nesting). */}
            <LinkProvider key={linkState} initialState={linkState}>
              <TierKey tier={tier}>
                <UIProvider>
                  <Suspense fallback={null}>
                    <Story />
                  </Suspense>
                </UIProvider>
              </TierKey>
            </LinkProvider>
          </SuiProvider>
        </ThemeBridge>
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
    // Per-mode accent colours, driven by the custom toolbar picker in
    // .storybook/manager.tsx (no built-in toolbar UI of their own).
    accentLight: { name: "Accent (light)", defaultValue: DEFAULT_ACCENT_COLOR },
    accentDark: { name: "Accent (dark)", defaultValue: DEFAULT_ACCENT_COLOR },
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
    linkState: {
      name: "Link",
      description: "Account-link state — drives useLink() everywhere",
      defaultValue: "linked-subscribed",
      toolbar: {
        icon: "link",
        items: [
          { value: "unlinked", title: "Unlinked" },
          { value: "linked-free", title: "Linked · Free" },
          { value: "linked-subscribed", title: "Linked · PAYG" },
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
