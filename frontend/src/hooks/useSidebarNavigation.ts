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

  const defaultNavClick = useCallback((e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
  }, []);

  const getHomeNavigation = useCallback((): SidebarNavigationProps => {
    const href = '/'; // SSR-safe relative path
    return { href, onClick: defaultNavClick };
  }, [defaultNavClick]);

  const getToolNavigation = useCallback((toolId: string): SidebarNavigationProps | null => {
    // Handle special nav sections that aren't tools
    if (toolId === 'read') return { href: '/read', onClick: defaultNavClick };
    if (toolId === 'automate') return { href: '/automate', onClick: defaultNavClick };

    const tool = getSelectedTool(toolId);
    if (!tool) return null;
    
    // Delegate to useToolNavigation for true tools
    return getToolNavProps(toolId, tool);
  }, [getToolNavProps, getSelectedTool, defaultNavClick]);

  return {
    getHomeNavigation,
    getToolNavigation
  };
}