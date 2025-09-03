import { useCallback } from 'react';
import { ToolId } from '../types/toolId';
import { ToolRegistryEntry, getToolUrlPath } from '../data/toolsTaxonomy';
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
  const { handleToolSelect } = useToolWorkflow();

  const getToolNavigation = useCallback((toolId: string, tool: ToolRegistryEntry): ToolNavigationProps => {
    // Generate SSR-safe relative path
    const path = getToolUrlPath(toolId, tool);
    const href = path; // Relative path, no window.location needed

    // Click handler that maintains SPA behavior
    const onClick = (e: React.MouseEvent) => {
      // Check if it's a special click (ctrl+click, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
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
  }, [handleToolSelect]);

  return { getToolNavigation };
}