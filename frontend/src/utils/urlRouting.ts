/**
 * URL routing utilities for tool navigation with registry support
 */

import {
  ToolId,
  ToolRoute,
  getDefaultWorkbench
} from '../types/navigation';
import { ToolRegistry, getToolWorkbench, getToolUrlPath, isValidToolId } from '../data/toolsTaxonomy';
import { firePixel } from './scarfTracking';

/**
 * Parse the current URL to extract tool routing information
 */
export function parseToolRoute(registry: ToolRegistry): ToolRoute {
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  // Try to find tool by URL path
  for (const [toolId, tool] of Object.entries(registry)) {
    const toolUrlPath = getToolUrlPath(toolId, tool);
    if (path === toolUrlPath) {
      return {
        workbench: getToolWorkbench(tool),
        toolId
      };
    }
  }

  // Check for query parameter fallback (e.g., ?tool=split)
  const toolParam = searchParams.get('tool');
  if (toolParam && isValidToolId(toolParam, registry)) {
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

  const newPath = getToolUrlPath(toolId, tool);
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

  updateUrl('/', searchParams, replace);
}

/**
 * Get clean tool name for display purposes using registry
 */
export function getToolDisplayName(toolId: ToolId, registry: ToolRegistry): string {
  const tool = registry[toolId];
  return tool ? tool.name : toolId;
}

/**
 * Generate shareable URL for current tool state using registry
 */
export function generateShareableUrl(toolId: ToolId | null, registry: ToolRegistry): string {
  const baseUrl = window.location.origin;

  if (!toolId || !registry[toolId]) {
    return baseUrl;
  }

  const tool = registry[toolId];

  const path = getToolUrlPath(toolId, tool);
  return `${baseUrl}${path}`;
}
