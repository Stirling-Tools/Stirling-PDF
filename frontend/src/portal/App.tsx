import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@app/contexts/ThemeContext";
import { TierProvider } from "@app/contexts/TierContext";
import { UIProvider, useUI } from "@app/contexts/UIContext";
import { AppShell } from "@app/components/AppShell";
import { AssistantButton } from "@app/components/AssistantButton";
import { AssistantPanel } from "@app/components/AssistantPanel";
import { SearchModal } from "@app/components/SearchModal";
import { ViewRouter } from "@app/ViewRouter";

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

export function App() {
  return (
    <ThemeProvider>
      <TierProvider initialTier="pro">
        <BrowserRouter>
          <UIProvider>
            <GlobalShortcuts />
            <AppShell>
              <ViewRouter />
            </AppShell>
            <AssistantButton />
            <AssistantPanel />
            <SearchModal />
          </UIProvider>
        </BrowserRouter>
      </TierProvider>
    </ThemeProvider>
  );
}
