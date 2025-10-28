/**
 * URL synchronization hooks for tool routing with registry support
 */

import { useEffect, useCallback, useRef } from 'react';
import { ToolId } from '../types/toolId';
import { parseToolRoute, updateToolRoute, clearToolRoute } from '../utils/urlRouting';
import { ToolRegistry } from '../data/toolsTaxonomy';
import { firePixel } from '../utils/scarfTracking';
import { withBasePath } from '../constants/app';

/**
 * Hook to sync workbench and tool with URL using registry
 */
export function useNavigationUrlSync(
  selectedTool: ToolId | null,
  handleToolSelect: (toolId: ToolId) => void,
  clearToolSelection: () => void,
  registry: ToolRegistry,
  enableSync: boolean = true
) {
  const hasInitialized = useRef(false);
  const prevSelectedTool = useRef<ToolId | null>(null);
  // Initialize workbench and tool from URL on mount
  useEffect(() => {
    if (!enableSync) return;

    // Fire pixel for initial page load
    const currentPath = window.location.pathname;
    firePixel(currentPath);

    const route = parseToolRoute(registry);
    if (route.toolId !== selectedTool) {
      if (route.toolId) {
        handleToolSelect(route.toolId);
      } else if (selectedTool !== null) {
        // Only clear selection if we actually had a tool selected
        // Don't clear on initial load when selectedTool starts as null
        clearToolSelection();
      }
    }

    hasInitialized.current = true;
  }, []); // Only run on mount

  // Update URL when tool or workbench changes
  useEffect(() => {
    if (!enableSync) return;

    if (selectedTool) {
      updateToolRoute(selectedTool, registry, false); // Use pushState for user navigation
    } else if (prevSelectedTool.current !== null) {
      // Only clear URL if we had a tool before (user navigated away)
      // Don't clear on initial load when both current and previous are null
      const homePath = withBasePath('/');
      if (window.location.pathname !== homePath) {
        clearToolRoute(false); // Use pushState for user navigation
      }
    }

    prevSelectedTool.current = selectedTool;
  }, [selectedTool, registry, enableSync]);

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
          handleToolSelect(route.toolId);
        } else {
          clearToolSelection();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedTool, handleToolSelect, clearToolSelection, registry, enableSync]);
}

/**
 * Hook to programmatically navigate to tools with registry support
 */
export function useToolNavigation(registry: ToolRegistry) {
  const navigateToTool = useCallback((toolId: ToolId) => {
    updateToolRoute(toolId, registry);

    // Dispatch a custom event to notify other components
    window.dispatchEvent(new CustomEvent('toolNavigation', {
      detail: { toolId }
    }));
  }, [registry]);

  const navigateToHome = useCallback(() => {
    clearToolRoute();

    // Dispatch a custom event to notify other components
    window.dispatchEvent(new CustomEvent('toolNavigation', {
      detail: { toolId: null }
    }));
  }, []);

  return {
    navigateToTool,
    navigateToHome
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
