/**
 * URL synchronization hooks for tool routing with registry support
 */

import { useEffect, useCallback } from 'react';
import { WorkbenchType, ToolId, ToolRoute } from '../types/navigation';
import { parseToolRoute, updateToolRoute, clearToolRoute } from '../utils/urlRouting';
import { ToolRegistry } from '../data/toolsTaxonomy';

/**
 * Hook to sync workbench and tool with URL using registry
 */
export function useNavigationUrlSync(
  workbench: WorkbenchType,
  selectedTool: ToolId | null,
  setWorkbench: (workbench: WorkbenchType) => void,
  setSelectedTool: (toolId: ToolId | null) => void,
  handleToolSelect: (toolId: string) => void,
  clearToolSelection: () => void,
  registry: ToolRegistry,
  enableSync: boolean = true
) {
  // Initialize workbench and tool from URL on mount
  useEffect(() => {
    if (!enableSync) return;

    const route = parseToolRoute(registry);
    if (route.toolId !== selectedTool) {
      if (route.toolId) {
        handleToolSelect(route.toolId);
      } else {
        clearToolSelection();
      }
    }
  }, []); // Only run on mount

  // Update URL when tool or workbench changes
  useEffect(() => {
    if (!enableSync) return;

    if (selectedTool) {
      updateToolRoute(selectedTool, registry);
    } else {
      // Clear URL when no tool is selected
      clearToolRoute();
    }
  }, [selectedTool, registry, enableSync]);

  // Handle browser back/forward navigation
  useEffect(() => {
    if (!enableSync) return;

    const handlePopState = () => {
      const route = parseToolRoute(registry);
      if (route.toolId !== selectedTool) {
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