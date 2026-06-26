import { useEffect, type ReactNode } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { AuthProvider } from "@shared/auth";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider, useLink } from "@portal/contexts/LinkContext";
import type { SupabaseLoginSession } from "@shared/auth/ui/useSupabaseLogin";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { mantineTheme } from "@portal/theme/mantineTheme";
import { AppShell } from "@portal/components/AppShell";
import { AuthGate } from "@portal/components/AuthGate";
import { AssistantButton } from "@portal/components/AssistantButton";
import { AssistantPanel } from "@portal/components/AssistantPanel";
import { SearchModal } from "@portal/components/SearchModal";
import { SettingsModal } from "@portal/components/SettingsModal";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import {
  AccountLinkProvider,
  useAccountLinkContext,
} from "@portal/contexts/AccountLinkContext";
import { ViewRouter } from "@portal/ViewRouter";

/**
 * Binds Mantine's colour scheme to the portal's own ThemeProvider so Mantine
 * components follow the same light/dark switch as the SUI primitives. Must sit
 * inside <ThemeProvider> to read useTheme().
 */
function PortalMantineProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={theme}>
      {children}
    </MantineProvider>
  );
}

/**
 * Global keyboard shortcuts. Lives below the UIProvider so it can dispatch
 * into the overlay state. Currently just ⌘K / Ctrl+K to toggle the search
 * palette.
 */
function GlobalShortcuts() {
  const { toggleSearch, closeSearch } = useUI();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        toggleSearch();
        return;
      }
      if (e.key === "Escape") {
        closeSearch();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSearch, closeSearch]);

  return null;
}

/** Bridges the Settings modal's open/close props to UIContext state. */
function SettingsHost() {
  const { settingsOpen, settingsInitialSection, closeSettings } = useUI();
  return (
    <SettingsModal
      open={settingsOpen}
      onClose={closeSettings}
      initialSection={settingsInitialSection}
    />
  );
}

/**
 * The one and only account-link login modal. Mounted at the app root (never
 * nested in another overlay) and driven by UIContext, so any "Link account" CTA
 * — sidebar, billing prompt, feature gate, Settings panel — opens this exact
 * instance. Linking is finished by the shared {@link useAccountLinkContext}
 * orchestration.
 */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal } = useUI();
  const { markSaasSessionChanged } = useLink();
  const link = useAccountLinkContext();
  // "reauth" only refreshes the browser SaaS session for attended reads — the
  // sign-in already applied it to the Supabase client, so we just signal a
  // refetch. It must NOT call completeLink (that re-registers → duplicate row).
  const onLinked =
    linkModalMode === "reauth"
      ? () => markSaasSessionChanged()
      : (session: SupabaseLoginSession) => link.completeLink(session);
  return (
    <LinkAccountModal
      open={linkModalOpen}
      mode={linkModalMode}
      onClose={closeLinkModal}
      onLinked={onLinked}
    />
  );
}

/**
 * The routed view, wrapped in an error boundary so a single view crashing can't
 * white-screen the portal (the shell + nav stay alive). Keyed by route so
 * navigating to another section clears any error from the previous one.
 */
function RoutedContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <ViewRouter />
    </ErrorBoundary>
  );
}

export function App() {
  // Honour the Vite base path so the portal routes correctly when served under a
  // subpath (e.g. "/portal" behind the single-origin proxy). BASE_URL is "./"
  // for a standalone build, which isn't a valid router basename, so only pass it
  // when it's an absolute subpath.
  const baseUrl = import.meta.env.BASE_URL;
  const basename = baseUrl.startsWith("/") ? baseUrl : undefined;
  return (
    <ThemeProvider>
      <PortalMantineProvider>
        <AuthProvider mode="spring">
          <LinkProvider initialState="unlinked">
            {/* TierProvider sits INSIDE LinkProvider so it can derive the tier
                from the real link/subscription state when MSW mocks are off. */}
            <TierProvider initialTier="pro">
              <BrowserRouter basename={basename}>
                <UIProvider>
                  <GlobalShortcuts />
                  <AuthGate>
                    <AccountLinkProvider>
                      <AppShell>
                        <RoutedContent />
                      </AppShell>
                      <AssistantButton />
                      <AssistantPanel />
                      <SearchModal />
                      <SettingsHost />
                      <LinkModalHost />
                    </AccountLinkProvider>
                  </AuthGate>
                </UIProvider>
              </BrowserRouter>
            </TierProvider>
          </LinkProvider>
        </AuthProvider>
      </PortalMantineProvider>
    </ThemeProvider>
  );
}
