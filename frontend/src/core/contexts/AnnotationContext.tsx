import React, { createContext, useContext, ReactNode, useRef } from "react";
import type {
  AnnotationAPI,
  AnnotationToolId,
} from "@app/components/viewer/viewerTypes";

interface AnnotationContextValue {
  annotationApiRef: React.RefObject<AnnotationAPI | null>;
  /** Ref to the panel-level activateAnnotationTool function — updates React state so buttons highlight correctly. Populated by Annotate.tsx. */
  activateAnnotationToolRef: React.RefObject<
    ((toolId: AnnotationToolId) => void) | null
  >;
}

const AnnotationContext = createContext<AnnotationContextValue | undefined>(
  undefined,
);

export const AnnotationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const annotationApiRef = useRef<AnnotationAPI>(null);
  const activateAnnotationToolRef = useRef<
    ((toolId: AnnotationToolId) => void) | null
  >(null);

  const value: AnnotationContextValue = {
    annotationApiRef,
    activateAnnotationToolRef,
  };

  return (
    <AnnotationContext.Provider value={value}>
      {children}
    </AnnotationContext.Provider>
  );
};

export const useAnnotation = (): AnnotationContextValue => {
  const context = useContext(AnnotationContext);
  if (!context) {
    throw new Error("useAnnotation must be used within an AnnotationProvider");
  }
  return context;
};
