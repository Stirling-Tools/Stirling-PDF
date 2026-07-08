import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import { useUI } from "@portal/contexts/UIContext";
import { AppShell } from "@portal/components/AppShell";
import { AssistantButton } from "@portal/components/AssistantButton";
import { AssistantPanel } from "@portal/components/AssistantPanel";
import { SearchModal } from "@portal/components/SearchModal";
import { SettingsModal } from "@portal/components/SettingsModal";
import { ViewRouter } from "@portal/ViewRouter";

/**
 * Global keyboard shortcuts. Lives below the UIProvider so it can dispatch into
 * the overlay state. Currently just ⌘K / Ctrl+K to toggle the search palette.
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
 * The flavor-agnostic portal chrome: the shell (sidebar + header + routed view)
 * plus the global overlays that every flavor shares. Requires only the Tier and
 * UI contexts above it — both flavors provide those. Flavor-specific overlays
 * (e.g. the self-hosted account-link modal) are mounted by PortalProviders, not
 * here.
 */
export function PortalChrome() {
  return (
    <>
      <GlobalShortcuts />
      {/* The pipeline builder reads the tool registry to list and configure operations. */}
      <ToolRegistryProvider>
        <AppShell>
          <RoutedContent />
        </AppShell>
      </ToolRegistryProvider>
      <AssistantButton />
      <AssistantPanel />
      <SearchModal />
      <SettingsHost />
    </>
  );
}
