/**
 * URL synchronization hooks for tool routing with registry support
 */

import { useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { ToolId } from "@app/types/toolId";
import {
  parseToolRoute,
  updateToolRoute,
  clearToolRoute,
} from "@app/utils/urlRouting";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import { firePixel } from "@app/utils/scarfTracking";
import { withBasePath } from "@app/constants/app";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Hook to sync workbench and tool with URL using registry
 */
export function useNavigationUrlSync(
  selectedTool: ToolId | null,
  handleToolSelect: (toolId: ToolId) => void,
  clearToolSelection: () => void,
  registry: ToolRegistry,
  enableSync: boolean = true,
  /**
   * Tool the default-startup-view preference selected, if any. That selection
   * sets the view, not the address, so it must not be written to the URL.
   */
  startupSelectedToolRef?: MutableRefObject<ToolId | null>,
) {
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;
  const hasInitialized = useRef(false);
  const prevSelectedTool = useRef<ToolId | null>(null);

  // Check if tool requires premium and redirect if needed
  const checkPremiumAndSelect = useCallback(
    (toolId: ToolId) => {
      const tool = registry[toolId];
      if (tool?.requiresPremium === true && premiumEnabled !== true) {
        // Premium tool accessed without premium - redirect to home
        const homePath = withBasePath(EDITOR_BASENAME);
        if (window.location.pathname !== homePath) {
          clearToolRoute(true); // Use replaceState to avoid adding to history
          window.location.href = homePath;
        }
        return;
      }
      handleToolSelect(toolId);
    },
    [registry, premiumEnabled, handleToolSelect],
  );

  // Initialize workbench and tool from URL on mount
  useEffect(() => {
    if (!enableSync) return;
    // Wait for config to load before checking premium status
    if (config === null) return;
    // Only run once on initial mount
    if (hasInitialized.current) return;

    // Fire pixel for initial page load
    const currentPath = window.location.pathname;
    firePixel(currentPath);

    const route = parseToolRoute(registry);
    if (route.toolId) {
      // URL specifies a tool — navigate to it (URL takes precedence over startup view preference)
      if (route.toolId !== selectedTool) {
        checkPremiumAndSelect(route.toolId);
      }
    }
    // When the URL is the home path (no tool), leave selectedTool untouched so that
    // the startup view preference (defaultStartupView) is respected.

    hasInitialized.current = true;
  }, [checkPremiumAndSelect, config, enableSync, registry, selectedTool]); // Include dependencies

  // Update URL when tool or workbench changes
  useEffect(() => {
    if (!enableSync) return;

    const startupTool = startupSelectedToolRef?.current ?? null;

    if (selectedTool) {
      // A startup-view selection is a view preference, not a navigation: writing
      // it here rewrote /editor to /read on every load. The effect re-runs
      // whenever the registry identity changes, so the marker has to survive
      // until the selection actually moves off it (cleared below).
      if (startupTool !== selectedTool) {
        updateToolRoute(selectedTool, registry, false); // Use pushState for user navigation
      }
    } else if (prevSelectedTool.current !== null) {
      // Only clear URL if we had a tool before (user navigated away)
      // Don't clear on initial load when both current and previous are null
      const homePath = withBasePath(EDITOR_BASENAME);
      if (window.location.pathname !== homePath) {
        clearToolRoute(false); // Use pushState for user navigation
      }
    }

    // Spent once the user leaves the startup-applied tool, so re-picking it
    // later is a real navigation and does update the URL.
    if (
      startupSelectedToolRef &&
      startupTool !== null &&
      prevSelectedTool.current === startupTool &&
      selectedTool !== startupTool
    ) {
      startupSelectedToolRef.current = null;
    }

    prevSelectedTool.current = selectedTool;
  }, [selectedTool, registry, enableSync, startupSelectedToolRef]);

  // Handle browser back/forward navigation
  useEffect(() => {
    if (!enableSync) return;

    const handlePopState = () => {
      const route = parseToolRoute(registry);
      if (route.toolId !== selectedTool) {
        // Fire pixel for back/forward navigation
        const currentPath = window.location.pathname;
        firePixel(currentPath);

        if (route.toolId) {
          checkPremiumAndSelect(route.toolId);
        } else {
          clearToolSelection();
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    selectedTool,
    handleToolSelect,
    clearToolSelection,
    registry,
    enableSync,
    checkPremiumAndSelect,
  ]);
}

/**
 * Hook to programmatically navigate to tools with registry support
 */
export function useToolNavigation(registry: ToolRegistry) {
  const navigateToTool = useCallback(
    (toolId: ToolId) => {
      updateToolRoute(toolId, registry);

      // Dispatch a custom event to notify other components
      window.dispatchEvent(
        new CustomEvent("toolNavigation", {
          detail: { toolId },
        }),
      );
    },
    [registry],
  );

  const navigateToHome = useCallback(() => {
    clearToolRoute();

    // Dispatch a custom event to notify other components
    window.dispatchEvent(
      new CustomEvent("toolNavigation", {
        detail: { toolId: null },
      }),
    );
  }, []);

  return {
    navigateToTool,
    navigateToHome,
  };
}

/**
 * Hook to get current URL route information with registry support
 */
export function useCurrentRoute(registry: ToolRegistry) {
  const getCurrentRoute = useCallback(() => {
    return parseToolRoute(registry);
  }, [registry]);

  return getCurrentRoute;
}
