import { useCallback } from 'react';
import { ToolRegistryEntry, getToolUrlPath } from '@app/data/toolsTaxonomy';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { handleUnlessSpecialClick } from '@app/utils/clickHandlers';
import { ToolId } from '@app/types/toolId';

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
    const path = getToolUrlPath(toolId);
    const href = path; // Relative path, no window.location needed

    // Click handler that maintains SPA behavior
    const onClick = (e: React.MouseEvent) => {
      handleUnlessSpecialClick(e, () => {
        // Handle external links normally
        if (tool.link) {
          window.open(tool.link, '_blank', 'noopener,noreferrer');
          return;
        }

        // Use SPA navigation for internal tools
        handleToolSelect(toolId as ToolId);
      });
    };

    return { href, onClick };
  }, [handleToolSelect]);

  return { getToolNavigation };
}
