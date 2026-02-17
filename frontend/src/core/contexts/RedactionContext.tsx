import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { RedactParameters } from '@app/hooks/tools/redact/useRedactParameters';
import { useNavigationGuard } from '@app/contexts/NavigationContext';
import { RedactionMode } from '@embedpdf/plugin-redaction';

/**
 * API interface that the EmbedPDF bridge will implement
 */
export interface SearchRedactOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface SearchTextResult {
  totalCount: number;
  foundOnPages: number[];
}

export interface RedactionAPI {
  toggleRedact: () => void;
  enableRedact: () => void;
  isRedactActive: () => boolean;
  endRedact: () => void;
  // Common methods
  commitAllPending: () => void;
  getActiveType: () => RedactionMode | null;
  getPendingCount: () => number;
  // Search and Redact methods
  searchText: (text: string, options?: SearchRedactOptions) => Promise<SearchTextResult>;
  redactText: (text: string, options?: SearchRedactOptions) => Promise<boolean>;
}

/**
 * State interface for redaction operations
 * Uses embedPDF v2.5.0 unified redaction mode
 */
interface RedactionState {
  // Current redaction configuration from the tool
  redactionConfig: RedactParameters | null;
  // Whether we're in redaction mode (viewer should show redaction layer)
  isRedactionMode: boolean;
  // Whether redactions have been applied
  redactionsApplied: boolean;
  // Synced state from EmbedPDF
  pendingCount: number;
  // Uses RedactionMode enum from v2.5.0
  activeType: RedactionMode | null;
  isRedacting: boolean;
  // Whether the redaction API bridge is ready (API ref is populated)
  isBridgeReady: boolean;
  // Color for manual redaction
  manualRedactColor: string;
}

/**
 * Actions interface for redaction operations
 * Uses embedPDF v2.5.0 unified redaction mode
 */
interface RedactionActions {
  setRedactionConfig: (config: RedactParameters | null) => void;
  setRedactionMode: (enabled: boolean) => void;
  setRedactionsApplied: (applied: boolean) => void;
  // Synced state setters (called from inside EmbedPDF)
  setPendingCount: (count: number) => void;
  setActiveType: (type: RedactionMode | null) => void;
  setIsRedacting: (isRedacting: boolean) => void;
  setBridgeReady: (ready: boolean) => void;
  setManualRedactColor: (color: string) => void;
  // Unified redaction actions (v2.5.0)
  activateRedact: () => void;
  deactivateRedact: () => void;
  commitAllPending: () => void;
  // Unified manual redaction action
  activateManualRedact: () => void;
  // Legacy UI actions (for backwards compatibility with UI)
  activateTextSelection: () => void;
  activateMarquee: () => void;
  // Search and Redact
  searchText: (text: string, options?: SearchRedactOptions) => Promise<SearchTextResult>;
  redactText: (text: string, options?: SearchRedactOptions) => Promise<boolean>;
}

/**
 * Combined context interface
 */
interface RedactionContextValue extends RedactionState, RedactionActions {
  // Ref that the bridge component will populate
  redactionApiRef: React.MutableRefObject<RedactionAPI | null>;
}

// Create context
const RedactionContext = createContext<RedactionContextValue | undefined>(undefined);

// Initial state
const initialState: RedactionState = {
  redactionConfig: null,
  isRedactionMode: false,
  redactionsApplied: false,
  pendingCount: 0,
  activeType: null,
  isRedacting: false,
  isBridgeReady: false,
  manualRedactColor: '#000000',
};

/**
 * Provider component for redaction functionality
 * Bridges between the tool panel (outside EmbedPDF) and the viewer (inside EmbedPDF)
 */
export const RedactionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<RedactionState>(initialState);
  const redactionApiRef = useRef<RedactionAPI | null>(null);
  const { setHasUnsavedChanges } = useNavigationGuard();

  // Actions for tool configuration
  const setRedactionConfig = useCallback((config: RedactParameters | null) => {
    setState(prev => ({
      ...prev,
      redactionConfig: config,
    }));
  }, []);

  const setRedactionMode = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      isRedactionMode: enabled,
    }));
  }, []);

  const setRedactionsApplied = useCallback((applied: boolean) => {
    setState(prev => ({
      ...prev,
      redactionsApplied: applied,
    }));
  }, []);

  // Synced state setters (called from bridge inside EmbedPDF)
  const setPendingCount = useCallback((count: number) => {
    setState(prev => ({
      ...prev,
      pendingCount: count,
    }));
  }, []);

  const setActiveType = useCallback((type: RedactionMode | null) => {
    setState(prev => ({
      ...prev,
      activeType: type,
    }));
  }, []);

  const setIsRedacting = useCallback((isRedacting: boolean) => {
    setState(prev => ({
      ...prev,
      isRedacting,
    }));
  }, []);

  const setBridgeReady = useCallback((ready: boolean) => {
    setState(prev => ({
      ...prev,
      isBridgeReady: ready,
    }));
  }, []);

  const setManualRedactColor = useCallback((color: string) => {
    setState(prev => ({
      ...prev,
      manualRedactColor: color,
    }));
  }, []);

  // Keep navigation guard aware of pending or applied redactions so we block navigation
  // Also clear the flag when all redactions have been saved
  useEffect(() => {
    if (state.pendingCount > 0 || state.redactionsApplied) {
      setHasUnsavedChanges(true);
    } else if (state.isRedactionMode) {
      // Only clear if we're in redaction mode - this avoids interfering with annotation changes
      // When there are no pending redactions and nothing has been applied, we're "clean"
      setHasUnsavedChanges(false);
    }
  }, [state.pendingCount, state.redactionsApplied, state.isRedactionMode, setHasUnsavedChanges]);

  // Unified redaction actions (v2.5.0)
  const activateRedact = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.enableRedact();
    }
  }, []);

  const deactivateRedact = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.endRedact();
    }
  }, []);

  const commitAllPending = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.commitAllPending();
      // Mark redactions as applied (but not yet saved) so the Save Changes button stays enabled
      // The button will only be disabled after the file is successfully saved
      setRedactionsApplied(true);
    }
  }, [setRedactionsApplied]);

  const activateManualRedact = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.enableRedact();
    }
  }, []);

  // Legacy UI actions for backwards compatibility
  // In v2.5.0, both text selection and marquee use the same unified mode
  // These just activate the unified redact mode and set the active type for UI state
  const activateTextSelection = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.enableRedact();
      setActiveType('redactSelection' as RedactionMode);
    }
  }, [setActiveType]);

  const activateMarquee = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.enableRedact();
      setActiveType('marqueeRedact' as RedactionMode);
    }
  }, [setActiveType]);

  // Search and Redact proxy methods
  const searchText = useCallback(async (text: string, options?: SearchRedactOptions): Promise<SearchTextResult> => {
    if (!redactionApiRef.current?.searchText) {
      throw new Error('Redaction API bridge not ready');
    }
    return redactionApiRef.current.searchText(text, options);
  }, []);

  const redactText = useCallback(async (text: string, options?: SearchRedactOptions): Promise<boolean> => {
    if (!redactionApiRef.current?.redactText) {
      throw new Error('Redaction API bridge not ready');
    }
    const result = await redactionApiRef.current.redactText(text, options);
    if (result) {
      setRedactionsApplied(true);
    }
    return result;
  }, [setRedactionsApplied]);

  const contextValue: RedactionContextValue = {
    ...state,
    redactionApiRef,
    setRedactionConfig,
    setRedactionMode,
    setRedactionsApplied,
    setPendingCount,
    setActiveType,
    setIsRedacting,
    setBridgeReady,
    setManualRedactColor,
    activateRedact,
    deactivateRedact,
    commitAllPending,
    activateManualRedact,
    activateTextSelection,
    activateMarquee,
    searchText,
    redactText,
  };

  return (
    <RedactionContext.Provider value={contextValue}>
      {children}
    </RedactionContext.Provider>
  );
};

/**
 * Hook to use redaction context
 */
export const useRedaction = (): RedactionContextValue => {
  const context = useContext(RedactionContext);
  if (context === undefined) {
    throw new Error('useRedaction must be used within a RedactionProvider');
  }
  return context;
};

/**
 * Hook for components that need to check if redaction mode is active
 */
export const useRedactionMode = () => {
  const context = useContext(RedactionContext);
  return {
    isRedactionModeActive: context?.isRedactionMode || false,
    hasRedactionConfig: context?.redactionConfig !== null,
    pendingCount: context?.pendingCount || 0,
    activeType: context?.activeType || null,
    isRedacting: context?.isRedacting || false,
    isBridgeReady: context?.isBridgeReady || false,
    manualRedactColor: context?.manualRedactColor || '#000000',
  };
};

