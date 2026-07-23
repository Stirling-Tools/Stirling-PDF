/// <reference types="vite/client" />
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
import { handlers } from "@portal/mocks/handlers";
import { configureSupabase } from "@proprietary/auth/supabase/supabaseClient";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { parse as parseToml } from "smol-toml";
import { rtlLanguages, supportedLanguages } from "@core/i18n/languages";

import "@mantine/core/styles.css";
import "@core/tokens/tokens.css";
import "@core/theme/index.css";
import "@core/tokens/base.css";

// Storybook-only: bundle every shipped locale's TOML at build time via a ?raw
// glob, so the toolbar language switcher can flip between all languages with no
// async fetch (Storybook has no backend to serve /locales/). t(key) then renders
// the shipped copy (e.g. "No sources connected yet") rather than the raw key.
const localeModules = import.meta.glob<string>(
  "../editor/public/locales/*/translation.toml",
  { query: "?raw", import: "default", eager: true },
);

// Parse each locale into an i18next resources map. A malformed TOML degrades to
// an empty bundle for that one locale (its keys fall back to en-US) rather than
// taking the whole Storybook down.
const resources: Record<string, { translation: Record<string, unknown> }> = {};
for (const [path, raw] of Object.entries(localeModules)) {
  const lng = path.match(/\/locales\/([^/]+)\/translation\.toml$/)?.[1];
  if (!lng) continue;
  let translation: Record<string, unknown>;
  try {
    translation = parseToml(raw) as Record<string, unknown>;
  } catch {
    translation = {};
  }
  resources[lng] = { translation };
}

if (!i18next.isInitialized) {
  // initImmediate: false → initialise synchronously from the inline resources
  // (there's no async backend here), so i18next is ready before the first story
  // renders. Without it the first render can beat init and stick on raw keys.
  void i18next.use(initReactI18next).init({
    lng: "en-US",
    fallbackLng: "en-US",
    supportedLngs: Object.keys(resources),
    resources,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    initImmediate: false,
  });
} else {
  // Something initialised i18next first (e.g. the app's async TOML backend):
  // inject every shipped locale's copy so t() renders real copy, not raw keys,
  // and the toolbar switcher can still change to any of them.
  for (const [lng, bundle] of Object.entries(resources)) {
    i18next.addResourceBundle(
      lng,
      "translation",
      bundle.translation,
      true,
      true,
    );
  }
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
 * Sets the theme attributes colors.css needs — always `data-app-theme="custom"`
 * with the fixed default accent (data-accent="default"), matching the editor.
 */
function SchemeSetup({ scheme }: { scheme: "light" | "dark" }) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-app-theme", "custom");
    root.setAttribute("data-accent", "default");
    root.setAttribute("data-mantine-color-scheme", scheme);
  }, [scheme]);
  return null;
}

/** Switches i18next to the toolbar locale and keeps document dir/lang in sync. */
const withLocale: Decorator = (Story, context) => {
  const locale = (context.globals.locale as string) ?? "en-US";
  useEffect(() => {
    void i18next.changeLanguage(locale);
    document.documentElement.dir = rtlLanguages.includes(locale)
      ? "rtl"
      : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);
  return <Story />;
};

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
  return (
    <MemoryRouter initialEntries={["/"]}>
      <ThemeProvider>
        <SchemeSetup scheme={colorScheme} />
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
        { name: "app", value: "var(--c-bg)" },
        { name: "surface", value: "var(--c-surface)" },
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
    locale: {
      name: "Locale",
      description: "Active language — drives useTranslation() in all stories",
      defaultValue: "en-US",
      toolbar: {
        icon: "globe",
        items: Object.entries(supportedLanguages).map(([value, title]) => ({
          value,
          title: `${value} - ${title}`,
        })),
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    withLocale,
    withProviders,
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-theme",
    }),
  ],
};

export default preview;
