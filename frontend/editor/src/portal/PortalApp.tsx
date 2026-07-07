import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AuthProvider } from "@app/auth";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider, useLink } from "@portal/contexts/LinkContext";
import type { SupabaseLoginSession } from "@app/auth/ui/useSupabaseLogin";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { SuiProvider } from "@portal/theme/SuiProvider";
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
// Reset + typography, scoped to .portal-scope below.
import "@portal/theme/base.css";

/**
 * Binds the SUI design system to the portal's own ThemeProvider so the SUI
 * components follow the same light/dark switch as the CSS tokens. Must sit
 * inside <ThemeProvider> to read useTheme().
 */
function ThemedSuiProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <SuiProvider colorScheme={theme}>{children}</SuiProvider>;
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

/**
 * The portal, mounted as a route-set under /portal/* inside the editor app (via
 * the admin-route seam). It supplies its own providers and its own i18next
 * instance (the `portal` namespace), but NOT a router — the editor's
 * <BrowserRouter> is the one and only router; the portal's routes are relative
 * to the /portal mount (see ViewRouter).
 */
export function PortalApp() {
  return (
    <ThemeProvider>
      <ThemedSuiProvider>
        {/* Scopes base.css to the portal so it doesn't restyle the host editor. */}
        <div className="portal-scope">
          <AuthProvider mode="spring">
            <LinkProvider initialState="unlinked">
              {/* TierProvider sits INSIDE LinkProvider so it can derive the tier
                from the real link/subscription state when MSW mocks are off. */}
              <TierProvider initialTier="pro">
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
              </TierProvider>
            </LinkProvider>
          </AuthProvider>
        </div>
      </ThemedSuiProvider>
    </ThemeProvider>
  );
}
