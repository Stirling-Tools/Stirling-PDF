import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { RedactParameters } from '@app/hooks/tools/redact/useRedactParameters';
import { useNavigationGuard } from '@app/contexts/NavigationContext';

/**
 * API interface that the EmbedPDF bridge will implement
 */
export interface RedactionAPI {
  toggleRedactSelection: () => void;
  toggleMarqueeRedact: () => void;
  commitAllPending: () => void;
  getActiveType: () => 'redactSelection' | 'marqueeRedact' | null;
  getPendingCount: () => number;
}

/**
 * State interface for redaction operations
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
  activeType: 'redactSelection' | 'marqueeRedact' | null;
  isRedacting: boolean;
}

/**
 * Actions interface for redaction operations
 */
interface RedactionActions {
  setRedactionConfig: (config: RedactParameters | null) => void;
  setRedactionMode: (enabled: boolean) => void;
  setRedactionsApplied: (applied: boolean) => void;
  // Synced state setters (called from inside EmbedPDF)
  setPendingCount: (count: number) => void;
  setActiveType: (type: 'redactSelection' | 'marqueeRedact' | null) => void;
  setIsRedacting: (isRedacting: boolean) => void;
  // Actions that call through to EmbedPDF API
  activateTextSelection: () => void;
  activateMarquee: () => void;
  commitAllPending: () => void;
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

  const setActiveType = useCallback((type: 'redactSelection' | 'marqueeRedact' | null) => {
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

  // Keep navigation guard aware of pending or applied redactions so we block navigation
  useEffect(() => {
    if (state.pendingCount > 0 || state.redactionsApplied) {
      setHasUnsavedChanges(true);
    }
  }, [state.pendingCount, state.redactionsApplied, setHasUnsavedChanges]);

  // Actions that call through to EmbedPDF API
  const activateTextSelection = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.toggleRedactSelection();
    }
  }, []);

  const activateMarquee = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.toggleMarqueeRedact();
    }
  }, []);

  const commitAllPending = useCallback(() => {
    if (redactionApiRef.current) {
      redactionApiRef.current.commitAllPending();
    }
  }, []);

  const contextValue: RedactionContextValue = {
    ...state,
    redactionApiRef,
    setRedactionConfig,
    setRedactionMode,
    setRedactionsApplied,
    setPendingCount,
    setActiveType,
    setIsRedacting,
    activateTextSelection,
    activateMarquee,
    commitAllPending,
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
  };
};

