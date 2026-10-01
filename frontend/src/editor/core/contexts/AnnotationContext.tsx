import React, {
  createContext,
  useContext,
  ReactNode,
  useRef,
  useState,
  useCallback,
} from "react";
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
  /**
   * Observable copy of the annotation panel's currently armed tool.
   * Annotate.tsx mirrors its local activeTool state here so the
   * CommentsSidebar (and other components outside the panel) can react
   * to "textComment is armed" without coupling to the panel's internals.
   * Null when no annotation tool is armed (panel not mounted or set to
   * "select").
   */
  activeAnnotationToolId: AnnotationToolId | null;
  setActiveAnnotationToolId: (id: AnnotationToolId | null) => void;
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
  const [activeAnnotationToolId, setActiveAnnotationToolIdState] =
    useState<AnnotationToolId | null>(null);
  const setActiveAnnotationToolId = useCallback(
    (id: AnnotationToolId | null) => {
      setActiveAnnotationToolIdState(id);
    },
    [],
  );

  const value: AnnotationContextValue = {
    annotationApiRef,
    activateAnnotationToolRef,
    activeAnnotationToolId,
    setActiveAnnotationToolId,
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
