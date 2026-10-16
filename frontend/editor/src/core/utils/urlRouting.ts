/**
 * URL routing utilities for tool navigation with registry support
 */

import { ToolRoute } from "@app/types/navigation";
import { ToolId, isValidToolId } from "@app/types/toolId";
import { getDefaultWorkbench } from "@app/types/workbench";
import {
  ToolRegistry,
  getToolWorkbench,
  getToolUrlPath,
} from "@app/data/toolsTaxonomy";
import { URL_TO_TOOL_MAP } from "@app/utils/urlMapping";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";

/**
 * An address as the router states it: app-relative, BASE_PATH already off.
 *
 * Everything here works in these terms rather than reading window.location. The
 * two disagree for a tick during a history move, and an effect that navigates on
 * the wrong one loops.
 */
export interface RouteLocation {
  pathname: string;
  search: string;
}

export function parseToolRoute(
  registry: ToolRegistry,
  location: RouteLocation,
): ToolRoute {
  const path = location.pathname;
  const searchParams = new URLSearchParams(location.search);

  // First, check URL mapping for multiple URL aliases
  const mappedToolId = URL_TO_TOOL_MAP[path];
  if (mappedToolId && registry[mappedToolId]) {
    const tool = registry[mappedToolId];
    return {
      workbench: getToolWorkbench(tool),
      toolId: mappedToolId,
    };
  }

  // Fallback: Try to find tool by primary URL path in registry
  for (const [toolId, tool] of Object.entries(registry)) {
    const toolUrlPath = getToolUrlPath(toolId);
    if (path === toolUrlPath && isValidToolId(toolId)) {
      return {
        workbench: getToolWorkbench(tool),
        toolId,
      };
    }
  }

  // Check for query parameter fallback (e.g., ?tool=split)
  const toolParam = searchParams.get("tool");
  if (toolParam && isValidToolId(toolParam) && registry[toolParam]) {
    const tool = registry[toolParam];
    return {
      workbench: getToolWorkbench(tool),
      toolId: toolParam,
    };
  }

  // Default to fileEditor workbench for home page
  return {
    workbench: getDefaultWorkbench(),
    toolId: null,
  };
}

/**
 * Where the address should move to, or null when it already says this. The result
 * is app-relative, which is what navigate() wants: <BrowserRouter basename> puts
 * BASE_PATH back on, so a target carrying it already arrives doubled.
 */
function routeTarget(path: string, from: RouteLocation): string | null {
  const searchParams = new URLSearchParams(from.search);
  // The path names the tool, so the query form of it never survives a move.
  searchParams.delete("tool");
  const queryString = searchParams.toString();
  const search = queryString ? `?${queryString}` : "";

  if (from.pathname === path && from.search === search) return null;
  return `${path}${search}`;
}

/** Where the address should move to for this tool selection. */
export function toolRoute(
  toolId: ToolId,
  registry: ToolRegistry,
  from: RouteLocation,
): string | null {
  if (!registry[toolId]) {
    console.warn(`Tool ${toolId} not found in registry`);
    return null;
  }
  return routeTarget(getToolUrlPath(toolId), from);
}

/** Where the address should move to with no tool open ("/" is the role router). */
export function editorHomeRoute(from: RouteLocation): string | null {
  return routeTarget(EDITOR_BASENAME, from);
}

/**
 * Get clean tool name for display purposes using registry
 */
export function getToolDisplayName(
  toolId: ToolId,
  registry: ToolRegistry,
): string {
  const tool = registry[toolId];
  return tool ? tool.name : toolId;
}
