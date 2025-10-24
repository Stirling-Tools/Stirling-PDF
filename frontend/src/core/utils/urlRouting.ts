/**
 * URL routing utilities for tool navigation with registry support
 */

import { ToolRoute } from '@app/types/navigation';
import { ToolId, isValidToolId } from '@app/types/toolId';
import { getDefaultWorkbench } from '@app/types/workbench';
import { ToolRegistry, getToolWorkbench, getToolUrlPath } from '@app/data/toolsTaxonomy';
import { firePixel } from '@app/utils/scarfTracking';
import { URL_TO_TOOL_MAP } from '@app/utils/urlMapping';
import { BASE_PATH, withBasePath } from '@app/constants/app';

/**
 * Parse the current URL to extract tool routing information
 */
export function parseToolRoute(registry: ToolRegistry): ToolRoute {
  const fullPath = window.location.pathname;
  // Remove base path to get app-relative path
  const path = BASE_PATH && fullPath.startsWith(BASE_PATH)
    ? fullPath.slice(BASE_PATH.length) || '/'
    : fullPath;
  const searchParams = new URLSearchParams(window.location.search);

  // First, check URL mapping for multiple URL aliases
  const mappedToolId = URL_TO_TOOL_MAP[path];
  if (mappedToolId && registry[mappedToolId]) {
    const tool = registry[mappedToolId];
    return {
      workbench: getToolWorkbench(tool),
      toolId: mappedToolId
    };
  }

  // Fallback: Try to find tool by primary URL path in registry
  for (const [toolId, tool] of Object.entries(registry)) {
    const toolUrlPath = getToolUrlPath(toolId);
    if (path === toolUrlPath && isValidToolId(toolId)) {
      return {
        workbench: getToolWorkbench(tool),
        toolId
      };
    }
  }

  // Check for query parameter fallback (e.g., ?tool=split)
  const toolParam = searchParams.get('tool');
  if (toolParam && isValidToolId(toolParam) && registry[toolParam]) {
    const tool = registry[toolParam];
    return {
      workbench: getToolWorkbench(tool),
      toolId: toolParam
    };
  }

  // Default to fileEditor workbench for home page
  return {
    workbench: getDefaultWorkbench(),
    toolId: null
  };
}

/**
 * Update URL and fire analytics pixel
 */
function updateUrl(newPath: string, searchParams: URLSearchParams, replace: boolean = false): void {
  const currentPath = window.location.pathname;
  const queryString = searchParams.toString();
  const fullUrl = newPath + (queryString ? `?${queryString}` : '');

  // Only update URL and fire pixel if something actually changed
  if (currentPath !== newPath || window.location.search !== (queryString ? `?${queryString}` : '')) {
    if (replace) {
      window.history.replaceState(null, '', fullUrl);
    } else {
      window.history.pushState(null, '', fullUrl);
    }
    firePixel(newPath);
  }
}

/**
 * Update the URL to reflect the current tool selection
 */
export function updateToolRoute(toolId: ToolId, registry: ToolRegistry, replace: boolean = false): void {
  const tool = registry[toolId];
  if (!tool) {
    console.warn(`Tool ${toolId} not found in registry`);
    return;
  }

  const toolPath = getToolUrlPath(toolId);
  const newPath = withBasePath(toolPath);
  const searchParams = new URLSearchParams(window.location.search);

  // Remove tool query parameter since we're using path-based routing
  searchParams.delete('tool');

  updateUrl(newPath, searchParams, replace);
}

/**
 * Clear tool routing and return to home page
 */
export function clearToolRoute(replace: boolean = false): void {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete('tool');

  updateUrl(withBasePath('/'), searchParams, replace);
}

/**
 * Get clean tool name for display purposes using registry
 */
export function getToolDisplayName(toolId: ToolId, registry: ToolRegistry): string {
  const tool = registry[toolId];
  return tool ? tool.name : toolId;
}
