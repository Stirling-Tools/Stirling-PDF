import { useCallback } from 'react';
import { useToolNavigation } from './useToolNavigation';
import { useToolManagement } from './useToolManagement';

export interface SidebarNavigationProps {
  /** Full URL for the navigation (for href attribute) */
  href: string;
  /** Click handler that maintains SPA behavior */
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Hook that provides URL and navigation handlers for sidebar navigation buttons
 * Supports special routes like home ('/') and specific tool routes
 */
export function useSidebarNavigation(): {
  getHomeNavigation: () => SidebarNavigationProps;
  getToolNavigation: (toolId: string) => SidebarNavigationProps | null;
} {
  const { getToolNavigation: getToolNavProps } = useToolNavigation();
  const { getSelectedTool } = useToolManagement();

  const getHomeNavigation = useCallback((): SidebarNavigationProps => {
    const href = window.location.origin + '/';
    
    const onClick = (e: React.MouseEvent) => {
      // Check if it's a special click (middle click, ctrl+click, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
        return; // Let browser handle it via href
      }

      // For regular clicks, prevent default and handle via SPA navigation
      e.preventDefault();
      // The existing click handler will be called after this
    };

    return { href, onClick };
  }, []);

  const getToolNavigation = useCallback((toolId: string): SidebarNavigationProps | null => {
    const tool = getSelectedTool(toolId);
    if (!tool) {
      return null;
    }

    return getToolNavProps(toolId, tool);
  }, [getToolNavProps, getSelectedTool]);

  return {
    getHomeNavigation,
    getToolNavigation
  };
}