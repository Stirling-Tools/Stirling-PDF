import { useEffect, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { AuthProvider } from "@shared/auth";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { mantineTheme } from "@portal/theme/mantineTheme";
import { AppShell } from "@portal/components/AppShell";
import { AuthGate } from "@portal/components/AuthGate";
import { AssistantButton } from "@portal/components/AssistantButton";
import { AssistantPanel } from "@portal/components/AssistantPanel";
import { SearchModal } from "@portal/components/SearchModal";
import { SettingsModal } from "@portal/components/SettingsModal";
import { AccountLinkStatusBootstrap } from "@portal/components/account-link/AccountLinkStatusBootstrap";
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
          <TierProvider initialTier="pro">
            <LinkProvider initialState="unlinked">
              <BrowserRouter basename={basename}>
                <UIProvider>
                  <GlobalShortcuts />
                  <AuthGate>
                    <AccountLinkStatusBootstrap />
                    <AppShell>
                      <ViewRouter />
                    </AppShell>
                    <AssistantButton />
                    <AssistantPanel />
                    <SearchModal />
                    <SettingsHost />
                  </AuthGate>
                </UIProvider>
              </BrowserRouter>
            </LinkProvider>
          </TierProvider>
        </AuthProvider>
      </PortalMantineProvider>
    </ThemeProvider>
  );
}
