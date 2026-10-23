import { useEffect, useImperativeHandle } from "react";
import { useRedaction as useEmbedPdfRedaction } from "@embedpdf/plugin-redaction/react";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import {
  useRedaction,
  useRedactionMode,
} from "@editor/contexts/RedactionContext";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useActiveDocumentId } from "@editor/components/viewer/useActiveDocumentId";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";
import { leaveRedactionMode } from "@editor/components/viewer/leaveRedactionMode";

/**
 * Bridges between the EmbedPDF redaction plugin and the Stirling-PDF RedactionContext.
 * Uses the unified redaction mode (toggleRedact/enableRedact/endRedact).
 */
export function RedactionAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();

  // Don't render the inner component until we have a valid document ID and document is ready
  if (!activeDocumentId || !documentReady) {
    return null;
  }

  return <RedactionAPIBridgeInner documentId={activeDocumentId} />;
}

function RedactionAPIBridgeInner({ documentId }: { documentId: string }) {
  const { state, provides: redactionProvides } =
    useEmbedPdfRedaction(documentId);
  const { provides: annotationProvides } = useAnnotationCapability();
  const { isRedactionModeActive } = useRedactionMode();
  const { selectedTool } = useNavigationState();
  const {
    redactionApiRef,
    setActiveType,
    setIsRedacting,
    setBridgeReady,
    manualRedactColor,
  } = useRedaction();

  // Ensure EmbedPDF exits redaction mode whenever we are not in redact tool mode
  useEffect(() => {
    if (selectedTool !== "redact") {
      leaveRedactionMode(redactionProvides);
    }
  }, [selectedTool, isRedactionModeActive, redactionProvides]);

  // Mark bridge as ready on mount, cleanup on unmount
  useEffect(() => {
    setBridgeReady(true);
    return () => {
      setBridgeReady(false);
      // The scope can belong to a document that a swap already closed.
      leaveRedactionMode(redactionProvides);
    };
  }, [setBridgeReady, redactionProvides]);

  // The interaction mode is viewer-global, so a stranded redaction mode would block
  // selection for the next document.
  useEffect(() => {
    return () => {
      leaveRedactionMode(redactionProvides);
    };
  }, [redactionProvides]);

  // Sync EmbedPDF state to our context
  useEffect(() => {
    if (state) {
      setActiveType(state.activeType ?? null);
      setIsRedacting(state.isRedacting ?? false);
    }
  }, [state, setActiveType, setIsRedacting]);

  // Synchronize manual redaction color with EmbedPDF
  // Manual redaction uses the 'redact' annotation tool internally
  useEffect(() => {
    const annotationApi = annotationProvides as {
      setToolDefaults?: (
        toolId: string,
        patch: Record<string, unknown>,
      ) => void;
    } | null;
    if (annotationApi?.setToolDefaults) {
      annotationApi.setToolDefaults("redact", {
        type: PdfAnnotationSubtype.REDACT,
        strokeColor: manualRedactColor,
        color: manualRedactColor,
        overlayColor: manualRedactColor,
        fillColor: manualRedactColor,
        interiorColor: manualRedactColor,
        backgroundColor: manualRedactColor,
        opacity: 1,
      });
    }
  }, [annotationProvides, manualRedactColor]);

  // Expose the EmbedPDF API through our context's ref
  useImperativeHandle(
    redactionApiRef,
    () => ({
      toggleRedact: () => {
        redactionProvides?.toggleRedact();
      },
      enableRedact: () => {
        redactionProvides?.enableRedact();
      },
      isRedactActive: () => {
        return redactionProvides?.isRedactActive() ?? false;
      },
      endRedact: () => {
        redactionProvides?.endRedact();
      },
      // Common methods
      commitAllPending: async () => {
        const task = redactionProvides?.commitAllPending();
        if (task && typeof task.toPromise === "function") {
          await task.toPromise();
        }
      },
      getActiveType: () => state?.activeType ?? null,
      getPendingCount: () => state?.pendingCount ?? 0,
    }),
    [redactionProvides, state],
  );

  return null;
}
