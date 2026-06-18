import { useEffect, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { AuthProvider } from "@shared/auth";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { mantineTheme } from "@portal/theme/mantineTheme";
import { AppShell } from "@portal/components/AppShell";
import { AuthGate } from "@portal/components/AuthGate";
import { AssistantButton } from "@portal/components/AssistantButton";
import { AssistantPanel } from "@portal/components/AssistantPanel";
import { SearchModal } from "@portal/components/SearchModal";
import { SettingsModal } from "@portal/components/SettingsModal";
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
  const { settingsOpen, closeSettings } = useUI();
  return <SettingsModal open={settingsOpen} onClose={closeSettings} />;
}

export function App() {
  return (
    <ThemeProvider>
      <PortalMantineProvider>
        <AuthProvider mode="spring">
          <TierProvider initialTier="pro">
            <BrowserRouter>
              <UIProvider>
                <GlobalShortcuts />
                <AuthGate>
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
          </TierProvider>
        </AuthProvider>
      </PortalMantineProvider>
    </ThemeProvider>
  );
}
