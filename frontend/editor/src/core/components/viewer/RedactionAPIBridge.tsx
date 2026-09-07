import { useEffect, useImperativeHandle } from "react";
import { useRedaction as useEmbedPdfRedaction } from "@embedpdf/plugin-redaction/react";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { useRedaction, useRedactionMode } from "@app/contexts/RedactionContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";

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
    setPendingCount,
    setActiveType,
    setIsRedacting,
    setBridgeReady,
    manualRedactColor,
  } = useRedaction();

  // Ensure EmbedPDF exits redaction mode whenever we are not in redact tool mode
  useEffect(() => {
    if (selectedTool !== "redact" && !isRedactionModeActive) {
      if (redactionProvides?.isRedactActive?.()) {
        redactionProvides.endRedact();
      }
    }
  }, [selectedTool, isRedactionModeActive, redactionProvides]);

  // Mark bridge as ready on mount, cleanup on unmount
  useEffect(() => {
    setBridgeReady(true);
    return () => {
      setBridgeReady(false);
      if (redactionProvides?.isRedactActive?.()) {
        redactionProvides.endRedact();
      }
    };
  }, [setBridgeReady, redactionProvides]);

  // Sync EmbedPDF state to our context
  useEffect(() => {
    if (state) {
      setPendingCount(state.pendingCount ?? 0);
      setActiveType(state.activeType ?? null);
      setIsRedacting(state.isRedacting ?? false);
    }
  }, [state, setPendingCount, setActiveType, setIsRedacting]);

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
      commitAllPending: () => {
        redactionProvides?.commitAllPending();
        // Don't set redactionsApplied here - it should only be set after the file is saved
        // The save operation in applyChanges will handle setting/clearing this flag
      },
      getActiveType: () => state?.activeType ?? null,
      getPendingCount: () => state?.pendingCount ?? 0,
    }),
    [redactionProvides, state],
  );

  return null;
}
