import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { SignParameters } from '../hooks/tools/sign/useSignParameters';
import { SignatureAPI } from '../components/viewer/SignatureAPIBridge';
import { HistoryAPI } from '../components/viewer/HistoryAPIBridge';

// Signature state interface
interface SignatureState {
  // Current signature configuration from the tool
  signatureConfig: SignParameters | null;
  // Whether we're in signature placement mode
  isPlacementMode: boolean;
}

// Signature actions interface
interface SignatureActions {
  setSignatureConfig: (config: SignParameters | null) => void;
  setPlacementMode: (enabled: boolean) => void;
  activateDrawMode: () => void;
  deactivateDrawMode: () => void;
  activateSignaturePlacementMode: () => void;
  activateDeleteMode: () => void;
  updateDrawSettings: (color: string, size: number) => void;
  undo: () => void;
  redo: () => void;
  storeImageData: (id: string, data: string) => void;
  getImageData: (id: string) => string | undefined;
}

// Combined context interface
interface SignatureContextValue extends SignatureState, SignatureActions {
  signatureApiRef: React.RefObject<SignatureAPI | null>;
  historyApiRef: React.RefObject<HistoryAPI | null>;
}

// Create context
const SignatureContext = createContext<SignatureContextValue | undefined>(undefined);

// Initial state
const initialState: SignatureState = {
  signatureConfig: null,
  isPlacementMode: false,
};

// Provider component
export const SignatureProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SignatureState>(initialState);
  const signatureApiRef = useRef<SignatureAPI>(null);
  const historyApiRef = useRef<HistoryAPI>(null);
  const imageDataStore = useRef<Map<string, string>>(new Map());

  // Actions
  const setSignatureConfig = useCallback((config: SignParameters | null) => {
    setState(prev => ({
      ...prev,
      signatureConfig: config,
    }));
  }, []);

  const setPlacementMode = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      isPlacementMode: enabled,
    }));
  }, []);

  const activateDrawMode = useCallback(() => {
    if (signatureApiRef.current) {
      signatureApiRef.current.activateDrawMode();
      setPlacementMode(true);
    }
  }, [setPlacementMode]);

  const deactivateDrawMode = useCallback(() => {
    if (signatureApiRef.current) {
      signatureApiRef.current.deactivateTools();
      setPlacementMode(false);
    }
  }, [setPlacementMode]);

  const activateSignaturePlacementMode = useCallback(() => {
    if (signatureApiRef.current) {
      signatureApiRef.current.activateSignaturePlacementMode();
      setPlacementMode(true);
    }
  }, [state.signatureConfig, setPlacementMode]);

  const activateDeleteMode = useCallback(() => {
    if (signatureApiRef.current) {
      signatureApiRef.current.activateDeleteMode();
      setPlacementMode(true);
    }
  }, [setPlacementMode]);

  const updateDrawSettings = useCallback((color: string, size: number) => {
    if (signatureApiRef.current) {
      signatureApiRef.current.updateDrawSettings(color, size);
    }
  }, []);

  const undo = useCallback(() => {
    if (historyApiRef.current) {
      historyApiRef.current.undo();
    }
  }, []);

  const redo = useCallback(() => {
    if (historyApiRef.current) {
      historyApiRef.current.redo();
    }
  }, []);

  const storeImageData = useCallback((id: string, data: string) => {
    imageDataStore.current.set(id, data);
  }, []);

  const getImageData = useCallback((id: string) => {
    return imageDataStore.current.get(id);
  }, []);

  // No auto-activation - all modes use manual buttons

  const contextValue: SignatureContextValue = {
    ...state,
    signatureApiRef,
    historyApiRef,
    setSignatureConfig,
    setPlacementMode,
    activateDrawMode,
    deactivateDrawMode,
    activateSignaturePlacementMode,
    activateDeleteMode,
    updateDrawSettings,
    undo,
    redo,
    storeImageData,
    getImageData,
  };

  return (
    <SignatureContext.Provider value={contextValue}>
      {children}
    </SignatureContext.Provider>
  );
};

// Hook to use signature context
export const useSignature = (): SignatureContextValue => {
  const context = useContext(SignatureContext);
  if (context === undefined) {
    throw new Error('useSignature must be used within a SignatureProvider');
  }
  return context;
};

// Hook for components that need to check if signature mode is active
export const useSignatureMode = () => {
  const context = useContext(SignatureContext);
  return {
    isSignatureModeActive: context?.isPlacementMode || false,
    hasSignatureConfig: context?.signatureConfig !== null,
  };
};