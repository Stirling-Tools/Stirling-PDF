/**
 * URL synchronization hooks for tool routing with registry support
 */

import { useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ToolId } from "@app/types/toolId";
import {
  parseToolRoute,
  toolRoute,
  editorHomeRoute,
} from "@app/utils/urlRouting";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import { firePixel } from "@app/utils/scarfTracking";
import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Hook to sync workbench and tool with URL using registry
 *
 * Both directions go through the router, reads included. State derived from the
 * path - the file library's reconciler above all - only sees addresses the router
 * knows, so writing one any other way moves the address past the view.
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
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const hasInitialized = useRef(false);
  const prevSelectedTool = useRef<ToolId | null>(null);
  // A pixel is a move, not a render.
  const countedPath = useRef<string | null>(null);

  // Held in a ref so neither pass below depends on it: a write that re-ran on
  // every address change would answer a Back by returning to the tool it left.
  const here = useRef({ pathname, search });
  here.current = { pathname, search };

  // Check if tool requires premium and redirect if needed
  const checkPremiumAndSelect = useCallback(
    (toolId: ToolId) => {
      const tool = registry[toolId];
      if (tool?.requiresPremium === true && premiumEnabled !== true) {
        // Replaced, not pushed: Back would land on an address that bounces again.
        const target = editorHomeRoute(here.current);
        if (target) navigate(target, { replace: true });
        return;
      }
      handleToolSelect(toolId);
    },
    [registry, premiumEnabled, handleToolSelect, navigate],
  );

  // Initialize workbench and tool from URL on mount
  useEffect(() => {
    if (!enableSync) return;
    // Wait for config to load before checking premium status
    if (config === null) return;
    // Only run once on initial mount
    if (hasInitialized.current) return;

    // Fire pixel for initial page load
    firePixel(window.location.pathname);

    const route = parseToolRoute(registry, here.current);
    if (route.toolId) {
      // URL specifies a tool — navigate to it (URL takes precedence over startup view preference)
      if (route.toolId !== selectedTool) {
        checkPremiumAndSelect(route.toolId);
      }
    }
    // When the URL is the home path (no tool), leave selectedTool untouched so that
    // the startup view preference (defaultStartupView) is respected.

    hasInitialized.current = true;
    countedPath.current = pathname;
  }, [
    checkPremiumAndSelect,
    config,
    enableSync,
    pathname,
    registry,
    selectedTool,
  ]);

  // Address -> selection, for every move after arrival, Back and forward included.
  // The mount pass above leaves an address carrying no tool alone so the
  // startup-view preference survives a reload; here it means no tool.
  useEffect(() => {
    if (!enableSync) return;
    if (!hasInitialized.current) return;
    // A selection the pass below has not pushed yet is in flight, not stale:
    // reconciling it against the address it is leaving would cancel the move.
    if (prevSelectedTool.current !== selectedTool) return;

    if (countedPath.current !== pathname) {
      countedPath.current = pathname;
      firePixel(window.location.pathname);
    }

    // Disagreement is the trigger, not arrival: a Back can land on the address a
    // tool was picked from, where the path is unchanged but the selection is not.
    const route = parseToolRoute(registry, here.current);
    if (route.toolId === selectedTool) return;
    if (route.toolId) {
      checkPremiumAndSelect(route.toolId);
    } else {
      clearToolSelection();
    }
  }, [
    pathname,
    selectedTool,
    clearToolSelection,
    registry,
    enableSync,
    checkPremiumAndSelect,
  ]);

  // Selection -> address. The pass above owns what an address change means.
  useEffect(() => {
    if (!enableSync) return;
    // Writing before the address has been read would push the startup view ahead
    // of whatever the address asked for.
    if (!hasInitialized.current) return;

    const startupTool = startupSelectedToolRef?.current ?? null;
    const previous = prevSelectedTool.current;

    // Only a change of selection is a navigation: the registry's identity churns,
    // and re-asserting the tool's address on every run would undo a Back the
    // moment it landed.
    if (selectedTool !== previous) {
      if (selectedTool) {
        // A startup-view selection is a view preference, not a navigation, or
        // every visit to /editor becomes /read. The marker survives until the
        // selection moves off it (cleared below).
        if (startupTool !== selectedTool) {
          const target = toolRoute(selectedTool, registry, here.current);
          if (target) navigate(target); // Pushed: picking a tool is a navigation
        }
      } else if (previous !== null) {
        // Only a tool's own address is this hook's to clear: the library and the
        // reader name no tool rather than holding a stale one, and sending them
        // home would undo the navigation that cleared the selection.
        if (parseToolRoute(registry, here.current).toolId !== null) {
          const target = editorHomeRoute(here.current);
          if (target) navigate(target);
        }
      }
    }

    // Spent once the user leaves the startup-applied tool, so re-picking it
    // later is a real navigation and does update the URL.
    if (
      startupSelectedToolRef &&
      startupTool !== null &&
      previous === startupTool &&
      selectedTool !== startupTool
    ) {
      startupSelectedToolRef.current = null;
    }

    prevSelectedTool.current = selectedTool;
  }, [selectedTool, registry, enableSync, startupSelectedToolRef, navigate]);
}
