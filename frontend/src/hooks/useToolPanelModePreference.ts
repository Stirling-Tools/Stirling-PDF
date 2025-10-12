import { useCallback, useEffect, useMemo, useState } from 'react';
import { TOOL_PANEL_MODE_STORAGE_KEY, ToolPanelMode } from '../contexts/toolWorkflow/toolWorkflowState';

const PROMPT_SEEN_KEY = 'toolPanelModePromptSeen';

export function useToolPanelModePreference() {
  const [hydrated, setHydrated] = useState(false);

  const getPreferredMode = useCallback((): ToolPanelMode | null => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(TOOL_PANEL_MODE_STORAGE_KEY);
    return stored === 'sidebar' || stored === 'fullscreen' ? stored : null;
  }, []);

  const setPreferredMode = useCallback((mode: ToolPanelMode) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TOOL_PANEL_MODE_STORAGE_KEY, mode);
  }, []);

  const hasSeenPrompt = useCallback((): boolean => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(PROMPT_SEEN_KEY) === 'true';
  }, []);

  const markPromptSeen = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROMPT_SEEN_KEY, 'true');
  }, []);

  const shouldShowPrompt = useMemo(() => {
    const seen = hasSeenPrompt();
    const pref = getPreferredMode();
    return !seen && !pref;
  }, [getPreferredMode, hasSeenPrompt]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return {
    hydrated,
    getPreferredMode,
    setPreferredMode,
    hasSeenPrompt,
    markPromptSeen,
    shouldShowPrompt,
  } as const;
}


