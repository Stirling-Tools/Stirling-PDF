import React, { createContext, useContext, useState, useCallback } from 'react';

// Context for managing single step expansion
interface SingleExpansionContextType {
  expandedStep: string | null;
  setExpandedStep: (stepId: string | null) => void;
  enabled: boolean;
}

const SingleExpansionContext = createContext<SingleExpansionContextType>({
  expandedStep: null,
  setExpandedStep: (_: string | null) => {},
  enabled: false,
});

export const useSingleExpansion = () => useContext(SingleExpansionContext);

// Provider component for single expansion mode
export const SingleExpansionProvider: React.FC<{ 
  children: React.ReactNode; 
  enabled: boolean;
  initialExpandedStep?: string | null;
}> = ({ children, enabled, initialExpandedStep = null }) => {
  const [expandedStep, setExpandedStep] = useState<string | null>(initialExpandedStep);

  const handleSetExpandedStep = useCallback((stepId: string | null) => {
    setExpandedStep(stepId);
  }, []);

  const contextValue: SingleExpansionContextType = {
    expandedStep,
    setExpandedStep: handleSetExpandedStep,
    enabled,
  };

  return (
    <SingleExpansionContext.Provider value={contextValue}>
      {children}
    </SingleExpansionContext.Provider>
  );
};
