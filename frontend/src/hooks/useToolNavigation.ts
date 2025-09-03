import { useCallback } from 'react';
import { ToolId } from '../types/toolId';
import { ToolRegistryEntry, getToolUrlPath } from '../data/toolsTaxonomy';
import { useNavigationActions } from '../contexts/NavigationContext';
import { useToolWorkflow } from '../contexts/ToolWorkflowContext';

export interface ToolNavigationProps {
  /** Full URL for the tool (for href attribute) */
  href: string;
  /** Click handler that maintains SPA behavior */
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Hook that provides URL and navigation handlers for tools
 * Enables right-click "Open in New Tab" while maintaining SPA behavior for regular clicks
 */
export function useToolNavigation(): {
  getToolNavigation: (toolId: string, tool: ToolRegistryEntry) => ToolNavigationProps;
} {
  const { actions } = useNavigationActions();
  const { handleToolSelect } = useToolWorkflow();

  const getToolNavigation = useCallback((toolId: string, tool: ToolRegistryEntry): ToolNavigationProps => {
    // Generate the full URL for href attribute
    const path = getToolUrlPath(toolId, tool);
    const href = `${window.location.origin}${path}`;

    // Click handler that maintains SPA behavior
    const onClick = (e: React.MouseEvent) => {
      // Check if it's a special click (middle click, ctrl+click, etc.)
      // These should use the default browser behavior to open in new tab
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
        return; // Let browser handle it via href
      }

      // Handle external links normally
      if (tool.link) {
        window.open(tool.link, '_blank', 'noopener,noreferrer');
        return;
      }

      // For regular clicks, prevent default and use SPA navigation
      e.preventDefault();
      handleToolSelect(toolId);
    };

    return { href, onClick };
  }, [actions, handleToolSelect]);

  return { getToolNavigation };
}