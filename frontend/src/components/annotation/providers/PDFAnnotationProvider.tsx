import React, { createContext, useContext, ReactNode } from 'react';

interface PDFAnnotationContextValue {
  // Drawing mode management
  activateDrawMode: () => void;
  deactivateDrawMode: () => void;
  activateSignaturePlacementMode: () => void;
  activateDeleteMode: () => void;

  // Drawing settings
  updateDrawSettings: (color: string, size: number) => void;

  // History operations
  undo: () => void;
  redo: () => void;

  // Image data management
  storeImageData: (id: string, data: string) => void;
  getImageData: (id: string) => string | undefined;

  // Placement state
  isPlacementMode: boolean;

  // Signature configuration
  signatureConfig: any | null;
  setSignatureConfig: (config: any | null) => void;
}

const PDFAnnotationContext = createContext<PDFAnnotationContextValue | undefined>(undefined);

interface PDFAnnotationProviderProps {
  children: ReactNode;
  // These would come from the signature context
  activateDrawMode: () => void;
  deactivateDrawMode: () => void;
  activateSignaturePlacementMode: () => void;
  activateDeleteMode: () => void;
  updateDrawSettings: (color: string, size: number) => void;
  undo: () => void;
  redo: () => void;
  storeImageData: (id: string, data: string) => void;
  getImageData: (id: string) => string | undefined;
  isPlacementMode: boolean;
  signatureConfig: any | null;
  setSignatureConfig: (config: any | null) => void;
}

export const PDFAnnotationProvider: React.FC<PDFAnnotationProviderProps> = ({
  children,
  activateDrawMode,
  deactivateDrawMode,
  activateSignaturePlacementMode,
  activateDeleteMode,
  updateDrawSettings,
  undo,
  redo,
  storeImageData,
  getImageData,
  isPlacementMode,
  signatureConfig,
  setSignatureConfig
}) => {
  const contextValue: PDFAnnotationContextValue = {
    activateDrawMode,
    deactivateDrawMode,
    activateSignaturePlacementMode,
    activateDeleteMode,
    updateDrawSettings,
    undo,
    redo,
    storeImageData,
    getImageData,
    isPlacementMode,
    signatureConfig,
    setSignatureConfig
  };

  return (
    <PDFAnnotationContext.Provider value={contextValue}>
      {children}
    </PDFAnnotationContext.Provider>
  );
};

export const usePDFAnnotation = (): PDFAnnotationContextValue => {
  const context = useContext(PDFAnnotationContext);
  if (context === undefined) {
    throw new Error('usePDFAnnotation must be used within a PDFAnnotationProvider');
  }
  return context;
};