import React, { createContext, useContext, ReactNode, useRef } from 'react';
import type { AnnotationAPI } from '@app/components/viewer/viewerTypes';

interface AnnotationContextValue {
  annotationApiRef: React.RefObject<AnnotationAPI | null>;
}

const AnnotationContext = createContext<AnnotationContextValue | undefined>(undefined);

export const AnnotationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const annotationApiRef = useRef<AnnotationAPI>(null);

  const value: AnnotationContextValue = {
    annotationApiRef,
  };

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
};

export const useAnnotation = (): AnnotationContextValue => {
  const context = useContext(AnnotationContext);
  if (!context) {
    throw new Error('useAnnotation must be used within an AnnotationProvider');
  }
  return context;
};
