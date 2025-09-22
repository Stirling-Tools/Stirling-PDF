import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { SignParameters } from '../hooks/tools/sign/useSignParameters';
import { SignatureAPI } from '../components/viewer/SignatureAPIBridge';

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
  updateDrawSettings: (color: string, size: number) => void;
}

// Combined context interface
interface SignatureContextValue extends SignatureState, SignatureActions {
  signatureApiRef: React.RefObject<SignatureAPI | null>;
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

  // Actions
  const setSignatureConfig = useCallback((config: SignParameters | null) => {
    console.log('SignatureContext: setSignatureConfig called with:', config);
    setState(prev => {
      console.log('SignatureContext: Previous state:', prev);
      const newState = {
        ...prev,
        signatureConfig: config,
      };
      console.log('SignatureContext: New state:', newState);
      return newState;
    });
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
    console.log('SignatureContext.activateSignaturePlacementMode called');
    if (signatureApiRef.current) {
      console.log('Calling signatureApiRef.current.activateSignaturePlacementMode()');
      signatureApiRef.current.activateSignaturePlacementMode();
      setPlacementMode(true);
    } else {
      console.log('signatureApiRef.current is null');
    }
  }, [state.signatureConfig, setPlacementMode]);

  const updateDrawSettings = useCallback((color: string, size: number) => {
    console.log('SignatureContext.updateDrawSettings called with color:', color, 'size:', size);
    console.log('signatureApiRef.current available:', !!signatureApiRef.current);
    if (signatureApiRef.current) {
      signatureApiRef.current.updateDrawSettings(color, size);
    } else {
      console.log('signatureApiRef.current is null - cannot update draw settings');
    }
  }, []);


  // No auto-activation - all modes use manual buttons

  const contextValue: SignatureContextValue = {
    ...state,
    signatureApiRef,
    setSignatureConfig,
    setPlacementMode,
    activateDrawMode,
    deactivateDrawMode,
    activateSignaturePlacementMode,
    updateDrawSettings,
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