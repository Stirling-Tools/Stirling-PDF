// useToolUrlRouting.ts
// A focused hook that encapsulates URL <-> tool-key mapping and browser history sync.
// - Keeps ToolWorkflowContext concerned with state/workflow, not routing concerns.
// - Testable: mapping helpers are pure; effects depend only on provided callbacks/inputs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseToolUrlRoutingOpts {
  /** Currently selected tool key (from context). */
  selectedToolKey: string | null;
  /** Registry of available tools (key -> tool metadata). */
  toolRegistry: Record<string, any> | null | undefined;
  /** Called when a tool should be selected without side-effects beyond selection (e.g., popstate). */
  selectTool: (toolKey: string) => void;
  /** Called when the selection should be cleared. */
  clearToolSelection: () => void;
  /** Called once during initialization if URL contains a tool; may trigger UI changes. */
  onInitSelect?: (toolKey: string) => void;
  /** Called when navigating via back/forward (popstate). Defaults to selectTool. */
  onPopStateSelect?: (toolKey: string) => void;
  /** Optional base path if the app isn't served at "/" (no trailing slash). Default: "" (root). */
  basePath?: string;
}

export function useToolUrlRouting(opts: UseToolUrlRoutingOpts) {
  const {
    selectedToolKey,
    toolRegistry,
    selectTool,
    clearToolSelection,
    onInitSelect,
    onPopStateSelect,
    basePath = '',
  } = opts;

  // Central slug map; keep here to co-locate routing policy.
  const urlMap = useMemo(
    () =>
      new Map<string, string>([
        ['compress', 'compress-pdf'],
        ['split', 'split-pdf'],
        ['convert', 'convert-pdf'],
        ['ocr', 'ocr-pdf'],
        ['merge', 'merge-pdf'],
        ['rotate', 'rotate-pdf'],
      ]),
    []
  );

  const getToolUrlSlug = useCallback(
    (toolKey: string) => urlMap.get(toolKey) || toolKey,
    [urlMap]
  );

  const getToolKeyFromSlug = useCallback(
    (slug: string) => {
      for (const [key, value] of urlMap) {
        if (value === slug) return key;
      }
      return slug; // fall back to raw key
    },
    [urlMap]
  );

  // Internal flag to avoid clearing URL on initial mount.
  const [hasInitialized, setHasInitialized] = useState(false);

  // Normalize a pathname by stripping basePath and leading slash.
  const normalizePath = useCallback(
    (fullPath: string) => {
      let p = fullPath;
      if (basePath && p.startsWith(basePath)) {
        p = p.slice(basePath.length);
      }
      if (p.startsWith('/')) p = p.slice(1);
      return p;
    },
    [basePath]
  );

  // Update URL when tool changes (but not on first paint before any selection happens).
  useEffect(() => {
    if (selectedToolKey) {
      const slug = getToolUrlSlug(selectedToolKey);
      const newUrl = `${basePath}/${slug}`.replace(/\/+/, '/');
      window.history.replaceState({}, '', newUrl);
      setHasInitialized(true);
    } else if (hasInitialized) {
      const rootUrl = basePath || '/';
      window.history.replaceState({}, '', rootUrl);
    }
  }, [selectedToolKey, getToolUrlSlug, hasInitialized, basePath]);

  // Initialize from URL when the registry is ready and nothing is selected yet.
  useEffect(() => {
    if (!toolRegistry || Object.keys(toolRegistry).length === 0) return;
    if (selectedToolKey) return; // don't override explicit selection

    const currentPath = normalizePath(window.location.pathname);
    if (currentPath) {
      const toolKey = getToolKeyFromSlug(currentPath);
      if (toolRegistry[toolKey]) {
        (onInitSelect ?? selectTool)(toolKey);
      }
    }
  }, [toolRegistry, selectedToolKey, getToolKeyFromSlug, selectTool, onInitSelect, normalizePath]);

  // Handle browser back/forward.
  const popHandlerRef = useRef<(this: Window, ev: PopStateEvent) => any>();
  useEffect(() => {
    popHandlerRef.current = () => {
      const path = normalizePath(window.location.pathname);
      if (path) {
        const toolKey = getToolKeyFromSlug(path);
        if (toolRegistry && toolRegistry[toolKey]) {
          (onPopStateSelect ?? selectTool)(toolKey);
          return;
        }
      }
      clearToolSelection();
    };

    const handler = (e: PopStateEvent) => popHandlerRef.current?.call(window, e);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [toolRegistry, selectTool, clearToolSelection, getToolKeyFromSlug, onPopStateSelect, normalizePath]);

  return { getToolUrlSlug, getToolKeyFromSlug };
}