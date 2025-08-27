/**
 * URL synchronization hooks for tool routing
 */

import { useEffect, useCallback } from 'react';
import { ModeType } from '../types/navigation';
import { parseToolRoute, updateToolRoute, clearToolRoute } from '../utils/urlRouting';

/**
 * Hook to sync navigation mode with URL
 */
export function useNavigationUrlSync(
  currentMode: ModeType,
  setMode: (mode: ModeType) => void,
  enableSync: boolean = true
) {
  // Initialize mode from URL on mount
  useEffect(() => {
    if (!enableSync) return;

    const route = parseToolRoute();
    if (route.mode !== currentMode) {
      setMode(route.mode);
    }
  }, []); // Only run on mount

  // Update URL when mode changes
  useEffect(() => {
    if (!enableSync) return;

    // Only update URL for actual tool modes, not internal UI modes
    // URL clearing is handled by useToolWorkflowUrlSync when selectedToolKey becomes null
    if (currentMode !== 'fileEditor' && currentMode !== 'pageEditor' && currentMode !== 'viewer') {
      updateToolRoute(currentMode, currentMode);
    }
  }, [currentMode, enableSync]);

  // Handle browser back/forward navigation
  useEffect(() => {
    if (!enableSync) return;

    const handlePopState = () => {
      const route = parseToolRoute();
      if (route.mode !== currentMode) {
        setMode(route.mode);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentMode, setMode, enableSync]);
}

/**
 * Hook to sync tool workflow with URL
 */
export function useToolWorkflowUrlSync(
  selectedToolKey: string | null,
  selectTool: (toolKey: string) => void,
  clearTool: () => void,
  enableSync: boolean = true
) {
  // Initialize tool from URL on mount
  useEffect(() => {
    if (!enableSync) return;

    const route = parseToolRoute();
    if (route.toolKey && route.toolKey !== selectedToolKey) {
      selectTool(route.toolKey);
    } else if (!route.toolKey && selectedToolKey) {
      clearTool();
    }
  }, []); // Only run on mount

  // Update URL when tool changes
  useEffect(() => {
    if (!enableSync) return;

    if (selectedToolKey) {
      const route = parseToolRoute();
      if (route.toolKey !== selectedToolKey) {
        updateToolRoute(selectedToolKey as ModeType, selectedToolKey);
      }
    } else {
      // Clear URL when no tool is selected - always clear regardless of current URL
      clearToolRoute();
    }
  }, [selectedToolKey, enableSync]);
}

/**
 * Hook to get current URL route information
 */
export function useCurrentRoute() {
  const getCurrentRoute = useCallback(() => {
    return parseToolRoute();
  }, []);

  return getCurrentRoute;
}

/**
 * Hook to programmatically navigate to tools
 */
export function useToolNavigation() {
  const navigateToTool = useCallback((toolKey: string) => {
    updateToolRoute(toolKey as ModeType, toolKey);

    // Dispatch a custom event to notify other components
    window.dispatchEvent(new CustomEvent('toolNavigation', {
      detail: { toolKey }
    }));
  }, []);

  const navigateToHome = useCallback(() => {
    clearToolRoute();

    // Dispatch a custom event to notify other components
    window.dispatchEvent(new CustomEvent('toolNavigation', {
      detail: { toolKey: null }
    }));
  }, []);

  return {
    navigateToTool,
    navigateToHome
  };
}
