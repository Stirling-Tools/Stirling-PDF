import { useEffect, useState, useContext, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useNavigation } from "@app/contexts/NavigationContext";
import { useFileSelection } from "@app/contexts/FileContext";
import { BaseToolProps } from "@app/types/tool";
import { useSignature } from "@app/contexts/SignatureContext";
import { useAnnotation as useAnnotationContext } from "@app/contexts/AnnotationContext";
import { ViewerContext, useViewer } from "@app/contexts/ViewerContext";
import type {
  AnnotationToolId,
  AnnotationEvent,
  AnnotationSelection,
  AnnotationRect,
} from "@app/components/viewer/viewerTypes";
import { useAnnotationStyleState } from "@app/tools/annotate/useAnnotationStyleState";
import { useAnnotationSelection } from "@app/tools/annotate/useAnnotationSelection";
import { AnnotationPanel } from "@app/tools/annotate/AnnotationPanel";

// Tools that require drawing/interacting with the PDF and should disable pan mode
const DRAWING_TOOLS: AnnotationToolId[] = [
  "highlight",
  "underline",
  "strikeout",
  "squiggly",
  "ink",
  "inkHighlighter",
  "text",
  "note",
  "textComment",
  "insertText",
  "replaceText",
  "square",
  "circle",
  "line",
  "lineArrow",
  "polyline",
  "polygon",
  "stamp",
  "signatureStamp",
  "signatureInk",
];

const KNOWN_ANNOTATION_TOOLS: AnnotationToolId[] = [
  "select",
  "highlight",
  "underline",
  "strikeout",
  "squiggly",
  "ink",
  "inkHighlighter",
  "text",
  "note",
  "textComment",
  "insertText",
  "replaceText",
  "square",
  "circle",
  "line",
  "lineArrow",
  "polyline",
  "polygon",
  "stamp",
  "signatureStamp",
  "signatureInk",
];

const isKnownAnnotationTool = (
  toolId: string | undefined | null,
): toolId is AnnotationToolId =>
  !!toolId && (KNOWN_ANNOTATION_TOOLS as string[]).includes(toolId);

const Annotate = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedTool, workbench, hasUnsavedChanges } = useNavigation();
  const { selectedFiles } = useFileSelection();
  const {
    signatureApiRef,
    annotationApiRef,
    historyApiRef,
    undo,
    redo,
    setSignatureConfig,
    setPlacementMode,
    placementPreviewSize,
    setPlacementPreviewSize,
  } = useSignature();
  const { activateAnnotationToolRef } = useAnnotationContext();
  const viewerContext = useContext(ViewerContext);
  const viewerContextRef = useRef(viewerContext);
  useEffect(() => {
    viewerContextRef.current = viewerContext;
  }, [viewerContext]);
  const {
    getZoomState,
    registerImmediateZoomUpdate,
    applyChanges,
    activeFileIndex,
    panActions,
    setCommentsSidebarVisible,
  } = useViewer();

  const [activeTool, setActiveTool] = useState<AnnotationToolId>("select");

  // Track the previous file index to detect file switches
  const prevFileIndexRef = useRef<number>(activeFileIndex);
  const activeToolRef = useRef<AnnotationToolId>("select");
  const wasAnnotateActiveRef = useRef<boolean>(false);
  const [selectedTextDraft, setSelectedTextDraft] = useState<string>("");
  const [selectedFontSize, setSelectedFontSize] = useState<number>(14);
  const [stampImageData, setStampImageData] = useState<string | undefined>();
  const [stampImageSize, setStampImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });
  const manualToolSwitch = useRef<boolean>(false);

  // Zoom tracking for stamp size conversion
  const [currentZoom, setCurrentZoom] = useState(() => {
    const zoomState = getZoomState();
    if (!zoomState) return 1;
    if (typeof zoomState.zoomPercent === "number") {
      return Math.max(zoomState.zoomPercent / 100, 0.01);
    }
    return Math.max(zoomState.currentZoom ?? 1, 0.01);
  });

  useEffect(() => {
    return registerImmediateZoomUpdate((newZoomPercent) => {
      setCurrentZoom(Math.max(newZoomPercent / 100, 0.01));
    });
  }, [registerImmediateZoomUpdate]);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // CSS to PDF size conversion accounting for zoom
  const cssToPdfSize = useCallback(
    (size: { width: number; height: number }) => {
      const zoom = currentZoom || 1;
      const factor = 1 / zoom;
      return {
        width: size.width * factor,
        height: size.height * factor,
      };
    },
    [currentZoom],
  );

  const computeStampDisplaySize = useCallback(
    (natural: { width: number; height: number } | null) => {
      if (!natural) {
        return { width: 180, height: 120 };
      }
      const maxSide = 260;
      const minSide = 24;
      const { width, height } = natural;
      const largest = Math.max(width || maxSide, height || maxSide, 1);
      const scale = Math.min(1, maxSide / largest);
      return {
        width: Math.max(minSide, Math.round(width * scale)),
        height: Math.max(minSide, Math.round(height * scale)),
      };
    },
    [],
  );

  const { styleState, styleActions, buildToolOptions, getActiveColor } =
    useAnnotationStyleState(cssToPdfSize);

  const {
    setInkWidth,
    setShapeThickness,
    setTextColor,
    setTextBackgroundColor,
    setNoteBackgroundColor,
    setInkColor,
    setHighlightColor,
    setHighlightOpacity,
    setFreehandHighlighterWidth,
    setUnderlineColor,
    setUnderlineOpacity,
    setStrikeoutColor,
    setStrikeoutOpacity,
    setSquigglyColor,
    setSquigglyOpacity,
    setShapeStrokeColor,
    setShapeFillColor,
    setShapeOpacity,
    setShapeStrokeOpacity,
    setShapeFillOpacity,
    setTextAlignment,
  } = styleActions;

  const handleApplyChanges = useCallback(async () => {
    if (applyChanges) {
      await applyChanges();
    }
  }, [applyChanges]);

  // Deactivate all annotation tools when the Annotate component unmounts (e.g. switching to Sign tool).
  // The dep-change effect below only fires while mounted, so unmount needs its own cleanup.
  useEffect(() => {
    return () => {
      annotationApiRef?.current?.deactivateTools?.();
      signatureApiRef?.current?.deactivateTools?.();
      setPlacementMode(false);
      viewerContextRef.current?.setAnnotationMode(false);
    };
  }, []);

  useEffect(() => {
    const isAnnotateActive =
      workbench === "viewer" && selectedTool === "annotate";
    if (wasAnnotateActiveRef.current && !isAnnotateActive) {
      annotationApiRef?.current?.deactivateTools?.();
      signatureApiRef?.current?.deactivateTools?.();
      setPlacementMode(false);
      viewerContext?.setAnnotationMode(false);
    } else if (!wasAnnotateActiveRef.current && isAnnotateActive) {
      // When entering annotate mode, activate the select tool by default
      // Also reset React state to match — EmbedPDF always starts at 'select' here
      setActiveTool("select");
      activeToolRef.current = "select";
      const toolOptions = buildToolOptions("select");
      annotationApiRef?.current?.activateAnnotationTool?.(
        "select",
        toolOptions,
      );
    }
    wasAnnotateActiveRef.current = isAnnotateActive;
  }, [
    workbench,
    selectedTool,
    annotationApiRef,
    signatureApiRef,
    setPlacementMode,
    buildToolOptions,
    viewerContext,
  ]);

  // Monitor history state for undo/redo availability
  useEffect(() => {
    const historyApi = historyApiRef?.current;
    if (!historyApi) return;

    const updateAvailability = () =>
      setHistoryAvailability({
        canUndo: historyApi.canUndo?.() ?? false,
        canRedo: historyApi.canRedo?.() ?? false,
      });

    updateAvailability();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (!historyApi.subscribe) {
      // Fallback polling in case the history API doesn't support subscriptions
      interval = setInterval(updateAvailability, 350);
    } else {
      const unsubscribe = historyApi.subscribe(updateAvailability);
      return () => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
        if (interval) clearInterval(interval);
      };
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [historyApiRef?.current]);

  useEffect(() => {
    if (!viewerContext) return;
    if (viewerContext.isAnnotationMode) return;

    viewerContext.setAnnotationMode(true);
    const toolOptions =
      activeTool === "stamp"
        ? buildToolOptions("stamp", { stampImageData, stampImageSize })
        : buildToolOptions(activeTool);
    annotationApiRef?.current?.activateAnnotationTool?.(
      activeTool,
      toolOptions,
    );
  }, [
    viewerContext?.isAnnotationMode,
    signatureApiRef,
    activeTool,
    buildToolOptions,
    stampImageData,
    stampImageSize,
  ]);

  // Reset to 'select' mode when switching between files
  // The new PDF gets a fresh EmbedPDF instance - forcing user to re-select tool ensures it works properly
  useEffect(() => {
    if (prevFileIndexRef.current !== activeFileIndex) {
      prevFileIndexRef.current = activeFileIndex;

      // Reset to select mode when switching files
      // This forces the user to re-select their tool, which ensures proper activation on the new PDF
      if (activeTool !== "select") {
        setActiveTool("select");
        activeToolRef.current = "select";

        // Clean up placement mode if we were in stamp tool
        setPlacementMode(false);
        setSignatureConfig(null);

        // Small delay to ensure the new EmbedPDF instance is ready, then activate select mode
        const timer = setTimeout(() => {
          if (annotationApiRef?.current) {
            annotationApiRef.current.deselectAnnotation?.();
            annotationApiRef.current.activateAnnotationTool?.("select");
          }
        }, 100);

        return () => clearTimeout(timer);
      }
    }
  }, [activeFileIndex, activeTool, setPlacementMode, setSignatureConfig]);

  const activateAnnotationTool = (toolId: AnnotationToolId) => {
    // If leaving stamp tool, clean up placement mode
    if (activeTool === "stamp" && toolId !== "stamp") {
      setPlacementMode(false);
      setSignatureConfig(null);
    }

    viewerContext?.setAnnotationMode(true);

    // Mark as manual tool switch to prevent auto-switch back
    manualToolSwitch.current = true;

    // Deselect annotation in the viewer first
    annotationApiRef?.current?.deselectAnnotation?.();

    // Clear selection state to show default controls
    setSelectedAnn(null);
    setSelectedAnnId(null);

    // Disable pan mode when activating drawing tools to avoid conflict
    if (DRAWING_TOOLS.includes(toolId)) {
      panActions.disablePan();
    }

    // Change the tool
    setActiveTool(toolId);
    const options =
      toolId === "stamp"
        ? buildToolOptions("stamp", { stampImageData, stampImageSize })
        : buildToolOptions(toolId);

    // For stamp, apply the image if we have one
    annotationApiRef?.current?.setAnnotationStyle?.(toolId, options);
    annotationApiRef?.current?.activateAnnotationTool?.(
      toolId === "stamp" ? "stamp" : toolId,
      options,
    );

    // Auto-open comments sidebar when a comment tool is selected
    if (["textComment", "insertText", "replaceText"].includes(toolId)) {
      setCommentsSidebarVisible(true);
    }

    // Reset flag after a short delay
    setTimeout(() => {
      manualToolSwitch.current = false;
    }, 300);
  };

  // Keep ref in sync so external callers (e.g. CommentsSidebar) get the latest closure
  activateAnnotationToolRef.current = activateAnnotationTool;

  useEffect(() => {
    // push style updates to EmbedPDF when sliders/colors change
    if (activeTool === "stamp") {
      const options = buildToolOptions("stamp", {
        stampImageData,
        stampImageSize,
      });
      annotationApiRef?.current?.setAnnotationStyle?.("stamp", options);
    } else {
      annotationApiRef?.current?.setAnnotationStyle?.(
        activeTool,
        buildToolOptions(activeTool),
      );
    }
  }, [
    activeTool,
    buildToolOptions,
    signatureApiRef,
    stampImageData,
    stampImageSize,
  ]);

  // Sync preview size from overlay to annotation engine
  useEffect(() => {
    // When preview size changes, update stamp annotation sizing
    // The SignatureAPIBridge will use placementPreviewSize from SignatureContext
    // and apply the converted size to the stamp tool automatically
    if (activeTool === "stamp" && stampImageData) {
      const size = placementPreviewSize ?? stampImageSize;
      const stampOptions = buildToolOptions("stamp", {
        stampImageData,
        stampImageSize: size ?? null,
      });
      annotationApiRef?.current?.setAnnotationStyle?.("stamp", stampOptions);
    }
  }, [
    placementPreviewSize,
    activeTool,
    stampImageData,
    signatureApiRef,
    stampImageSize,
    cssToPdfSize,
    buildToolOptions,
  ]);

  // Auto-switch to 'select' after placing a note or text annotation
  // EmbedPDF fires 'create' + committed:true when placement is finalised
  useEffect(() => {
    const unsubscribe = annotationApiRef?.current?.onAnnotationEvent?.(
      (event: AnnotationEvent) => {
        if (event.type === "create" && event.committed) {
          const toolId = activeToolRef.current;
          if (
            [
              "text",
              "note",
              "textComment",
              "insertText",
              "replaceText",
            ].includes(toolId)
          ) {
            setActiveTool("select");
            activeToolRef.current = "select";
            annotationApiRef?.current?.activateAnnotationTool?.("select");
          }
        }
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [annotationApiRef?.current]);

  // Clipboard ref for copy/paste — no re-render needed
  const clipboardRef = useRef<{
    pageIndex: number;
    annotation: Record<string, unknown>;
  } | null>(null);

  // Click-outside to blur FreeText/note inline editing so user can then drag the annotation.
  // When clicking the selection menu (e.g. Properties), only blur — do not deselect so the menu/popover can respond.
  useEffect(() => {
    const handleCapture = (e: MouseEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.isContentEditable) return;

      const pageEl = active.closest("[data-page-index]") as HTMLElement | null;
      if (!pageEl) return;

      const editingWrapper = active.parentElement;
      const target = e.target as Node;
      if (editingWrapper?.contains(target)) return;

      active.blur();

      const onSelectionMenu = (target as HTMLElement).closest?.(
        "[data-annotation-selection-menu]",
      );
      if (onSelectionMenu) return;

      const pageParent = pageEl.parentElement;
      if (!pageParent) return;
      const synthetic = new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerId: 1,
        pointerType: "mouse",
      });
      pageParent.dispatchEvent(synthetic);
    };

    document.addEventListener("mousedown", handleCapture, true);
    return () => document.removeEventListener("mousedown", handleCapture, true);
  }, []);

  // Keyboard shortcuts: Escape (cancel drawing), Backspace/Delete (delete selected), Ctrl+C/V (copy/paste)
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      // Backspace / Delete: delete selected annotation(s)
      if (e.key === "Backspace" || e.key === "Delete") {
        const multiSelected =
          annotationApiRef?.current?.getSelectedAnnotations?.();
        if (multiSelected && multiSelected.length > 0) {
          e.preventDefault();
          const toDelete = multiSelected
            .map((s: AnnotationSelection) => {
              const ann = s.object ?? s;
              return {
                pageIndex: ann.pageIndex ?? 0,
                id: ann.id ?? ann.uid ?? "",
              };
            })
            .filter((a: { id: string }) => a.id);
          if (toDelete.length > 0) {
            annotationApiRef?.current?.deleteAnnotations?.(toDelete);
          }
          return;
        }
        const selected: AnnotationSelection | null =
          annotationApiRef?.current?.getSelectedAnnotation?.() ?? null;
        if (!selected) return;
        e.preventDefault();
        const pageIndex: number =
          selected.pageIndex ?? selected.object?.pageIndex ?? 0;
        const annotationId: string =
          selected.id ??
          selected.object?.id ??
          selected.uid ??
          selected.object?.uid ??
          "";
        if (annotationId != null) {
          annotationApiRef?.current?.deleteAnnotation?.(
            pageIndex,
            annotationId,
          );
        }
        return;
      }

      // Ctrl+C: copy selected annotation
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const selected: AnnotationSelection | null =
          annotationApiRef?.current?.getSelectedAnnotation?.() ?? null;
        if (!selected) return;
        e.preventDefault();
        const ann = selected.object ?? selected;
        const pageIndex: number = ann.pageIndex ?? 0;
        clipboardRef.current = {
          pageIndex,
          annotation: { ...(ann as Record<string, unknown>) },
        };
        return;
      }

      // Ctrl+V: paste copied annotation (offset by ~20 PDF pts)
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        const clip = clipboardRef.current;
        if (!clip) return;
        e.preventDefault();
        const { pageIndex, annotation } = clip;
        const OFFSET = 20;
        const pasted: Record<string, unknown> = { ...annotation };
        // Assign a new id so EmbedPDF tracks the copy and delete works on it
        pasted.id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        delete pasted.uid;
        // Remove appearance stream reference — the copy needs its own rendering
        delete pasted.appearanceModes;
        // Shift the EmbedPDF Rect: { origin: { x, y }, size: { width, height } }
        // PDF coords have y=0 at bottom, so down = smaller y; right = larger x
        if (pasted.rect && typeof pasted.rect === "object") {
          const r = pasted.rect as AnnotationRect;
          if (r.origin && typeof r.origin === "object") {
            pasted.rect = {
              ...r,
              origin: { x: r.origin.x + OFFSET, y: r.origin.y - OFFSET },
            };
          }
        }
        annotationApiRef?.current?.createAnnotation?.(pageIndex, pasted);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [buildToolOptions, annotationApiRef]);

  const deriveToolFromAnnotation = useCallback(
    (
      annotation: AnnotationSelection | null | undefined,
    ): AnnotationToolId | undefined => {
      if (!annotation) return undefined;
      const customToolId =
        annotation.customData?.toolId ||
        annotation.customData?.annotationToolId;
      if (isKnownAnnotationTool(customToolId)) {
        return customToolId;
      }

      const type = annotation.type ?? annotation.object?.type;
      switch (type) {
        case 3:
          return "text"; // FREETEXT
        case 4:
          return "line"; // LINE
        case 5:
          return "square"; // SQUARE
        case 6:
          return "circle"; // CIRCLE
        case 7:
          return "polygon"; // POLYGON
        case 8:
          return "polyline"; // POLYLINE
        case 9:
          return "highlight"; // HIGHLIGHT
        case 10:
          return "underline"; // UNDERLINE
        case 11:
          return "squiggly"; // SQUIGGLY
        case 12:
          return "strikeout"; // STRIKEOUT
        case 13:
          return "stamp"; // STAMP
        case 15:
          return "ink"; // INK
        default:
          return undefined;
      }
    },
    [],
  );

  const { selectedAnn, setSelectedAnn, setSelectedAnnId } =
    useAnnotationSelection({
      annotationApiRef,
      deriveToolFromAnnotation,
      activeToolRef,
      setActiveTool,
      setSelectedTextDraft,
      setSelectedFontSize,
      setInkWidth,
      setShapeThickness,
      setTextColor,
      setTextBackgroundColor,
      setNoteBackgroundColor,
      setInkColor,
      setHighlightColor,
      setHighlightOpacity,
      setFreehandHighlighterWidth,
      setUnderlineColor,
      setUnderlineOpacity,
      setStrikeoutColor,
      setStrikeoutOpacity,
      setSquigglyColor,
      setSquigglyOpacity,
      setShapeStrokeColor,
      setShapeFillColor,
      setShapeOpacity,
      setShapeStrokeOpacity,
      setShapeFillOpacity,
      setTextAlignment,
    });

  const steps =
    selectedFiles.length === 0
      ? []
      : [
          {
            title: t("annotation.title", "Annotate"),
            isCollapsed: false,
            onCollapsedClick: undefined,
            content: (
              <AnnotationPanel
                activeTool={activeTool}
                activateAnnotationTool={activateAnnotationTool}
                styleState={styleState}
                styleActions={styleActions}
                getActiveColor={getActiveColor}
                buildToolOptions={buildToolOptions}
                deriveToolFromAnnotation={deriveToolFromAnnotation}
                selectedAnn={selectedAnn}
                selectedTextDraft={selectedTextDraft}
                setSelectedTextDraft={setSelectedTextDraft}
                selectedFontSize={selectedFontSize}
                setSelectedFontSize={setSelectedFontSize}
                annotationApiRef={annotationApiRef}
                signatureApiRef={signatureApiRef}
                viewerContext={viewerContext}
                setPlacementMode={setPlacementMode}
                setSignatureConfig={setSignatureConfig}
                computeStampDisplaySize={computeStampDisplaySize}
                stampImageData={stampImageData}
                setStampImageData={setStampImageData}
                stampImageSize={stampImageSize}
                setStampImageSize={setStampImageSize}
                setPlacementPreviewSize={setPlacementPreviewSize}
                undo={undo}
                redo={redo}
                historyAvailability={historyAvailability}
                onApplyChanges={handleApplyChanges}
                applyDisabled={!hasUnsavedChanges}
              />
            ),
          },
        ];
  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: false,
    },
    steps,
    review: {
      isVisible: false,
      operation: {
        files: [],
        thumbnails: [],
        isGeneratingThumbnails: false,
        downloadUrl: null,
        downloadFilename: "",
        isLoading: false,
        status: "",
        errorMessage: null,
        progress: null,
        executeOperation: async () => {},
        resetResults: () => {},
        clearError: () => {},
        cancelOperation: () => {},
        undoOperation: async () => {},
      },
      title: "",
      onFileClick: () => {},
      onUndo: () => {},
    },
    forceStepNumbers: true,
  });
};

export default Annotate;
