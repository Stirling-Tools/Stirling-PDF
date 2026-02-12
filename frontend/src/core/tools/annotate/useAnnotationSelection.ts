import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationAPI, AnnotationToolId } from '@app/components/viewer/viewerTypes';

interface UseAnnotationSelectionParams {
  annotationApiRef: React.RefObject<AnnotationAPI | null>;
  deriveToolFromAnnotation: (annotation: any) => AnnotationToolId | undefined;
  activeToolRef: React.MutableRefObject<AnnotationToolId>;
  manualToolSwitch: React.MutableRefObject<boolean>;
  setActiveTool: (toolId: AnnotationToolId) => void;
  setSelectedTextDraft: (text: string) => void;
  setSelectedFontSize: (size: number) => void;
  setInkWidth: (value: number) => void;
  setFreehandHighlighterWidth?: (value: number) => void;
  setShapeThickness: (value: number) => void;
  setTextColor: (value: string) => void;
  setTextBackgroundColor: (value: string) => void;
  setNoteBackgroundColor: (value: string) => void;
  setInkColor: (value: string) => void;
  setHighlightColor: (value: string) => void;
  setHighlightOpacity: (value: number) => void;
  setUnderlineColor: (value: string) => void;
  setUnderlineOpacity: (value: number) => void;
  setStrikeoutColor: (value: string) => void;
  setStrikeoutOpacity: (value: number) => void;
  setSquigglyColor: (value: string) => void;
  setSquigglyOpacity: (value: number) => void;
  setShapeStrokeColor: (value: string) => void;
  setShapeFillColor: (value: string) => void;
  setShapeOpacity: (value: number) => void;
  setShapeStrokeOpacity: (value: number) => void;
  setShapeFillOpacity: (value: number) => void;
  setTextAlignment: (value: 'left' | 'center' | 'right') => void;
}

const MARKUP_TOOL_IDS = ['highlight', 'underline', 'strikeout', 'squiggly'] as const;
const DRAWING_TOOL_IDS = ['ink', 'inkHighlighter'] as const;
const STAY_ACTIVE_TOOL_IDS = [...MARKUP_TOOL_IDS, ...DRAWING_TOOL_IDS] as const;

const isTextMarkupAnnotation = (annotation: any): boolean => {
  const toolId =
    annotation?.customData?.annotationToolId ||
    annotation?.customData?.toolId ||
    annotation?.object?.customData?.annotationToolId ||
    annotation?.object?.customData?.toolId;
  if (toolId && MARKUP_TOOL_IDS.includes(toolId)) return true;

  const type = annotation?.type ?? annotation?.object?.type;
  if (typeof type === 'number' && [9, 10, 11, 12].includes(type)) return true;

  const subtype = annotation?.subtype ?? annotation?.object?.subtype;
  if (typeof subtype === 'string') {
    const lower = subtype.toLowerCase();
    if (MARKUP_TOOL_IDS.some((t) => lower.includes(t))) return true;
  }
  return false;
};

const shouldStayOnPlacementTool = (annotation: any, derivedTool?: string | null | undefined): boolean => {
  // Text markup tools (highlight, underline, strikeout, squiggly) and drawing tools (ink, inkHighlighter) stay active
  // All other tools switch to select mode after placement

  const toolId =
    derivedTool ||
    annotation?.customData?.annotationToolId ||
    annotation?.customData?.toolId ||
    annotation?.object?.customData?.annotationToolId ||
    annotation?.object?.customData?.toolId;

  // Check if it's a tool that should stay active
  if (toolId && STAY_ACTIVE_TOOL_IDS.includes(toolId as any)) {
    return true;
  }

  // Check if it's a markup annotation by type/subtype
  if (isTextMarkupAnnotation(annotation)) {
    return true;
  }

  // All other tools (text, note, shapes, lines, stamps) switch to select
  return false;
};

export function useAnnotationSelection({
  annotationApiRef,
  deriveToolFromAnnotation,
  activeToolRef,
  manualToolSwitch,
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
  setFreehandHighlighterWidth,
}: UseAnnotationSelectionParams) {
  const [selectedAnn, setSelectedAnn] = useState<any | null>(null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const selectedAnnIdRef = useRef<string | null>(null);

  const applySelectionFromAnnotation = useCallback(
    (ann: any | null) => {
      const annObject = ann?.object ?? ann ?? null;
      const annId = annObject?.id ?? null;
      const type = annObject?.type;
      const derivedTool = annObject ? deriveToolFromAnnotation(annObject) : undefined;
      selectedAnnIdRef.current = annId;
      setSelectedAnnId(annId);
      // Normalize selected annotation to always expose .object for edit panels
      const normalizedSelection = ann?.object ? ann : annObject ? { object: annObject } : null;
      setSelectedAnn(normalizedSelection);

      if (annObject?.contents !== undefined) {
        setSelectedTextDraft(annObject.contents ?? '');
      }
      if (annObject?.fontSize !== undefined) {
        setSelectedFontSize(annObject.fontSize ?? 14);
      }
      if (annObject?.textAlign !== undefined) {
        const align = annObject.textAlign;
        if (typeof align === 'string') {
          const normalized = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
          setTextAlignment(normalized);
        } else if (typeof align === 'number') {
          const normalized = align === 1 ? 'center' : align === 2 ? 'right' : 'left';
          setTextAlignment(normalized);
        }
      }
      if (type === 3) {
        const background =
          (annObject?.backgroundColor as string | undefined) ||
          (annObject?.fillColor as string | undefined) ||
          undefined;
        const textColor = (annObject?.textColor as string | undefined) || (annObject?.color as string | undefined);
        if (textColor) {
          setTextColor(textColor);
        }
        if (derivedTool === 'note') {
          setNoteBackgroundColor(background || '');
        } else {
          setTextBackgroundColor(background || '');
        }
      }

      if (type === 15) {
        const width =
          annObject?.strokeWidth ?? annObject?.borderWidth ?? annObject?.lineWidth ?? annObject?.thickness;
        if (derivedTool === 'inkHighlighter') {
          if (annObject?.color) setHighlightColor(annObject.color);
          if (annObject?.opacity !== undefined) {
            setHighlightOpacity(Math.round((annObject.opacity ?? 1) * 100));
          }
          if (width !== undefined && setFreehandHighlighterWidth) {
            setFreehandHighlighterWidth(width);
          }
        } else {
          if (width !== undefined) setInkWidth(width ?? 2);
          if (annObject?.color) {
            setInkColor(annObject.color);
          }
        }
      } else if (type >= 4 && type <= 8) {
        const width = annObject?.strokeWidth ?? annObject?.borderWidth ?? annObject?.lineWidth;
        if (width !== undefined) {
          setShapeThickness(width ?? 1);
        }
      }

      if (type === 9) {
        if (annObject?.color) setHighlightColor(annObject.color);
        if (annObject?.opacity !== undefined) setHighlightOpacity(Math.round((annObject.opacity ?? 1) * 100));
      } else if (type === 10) {
        if (annObject?.color) setUnderlineColor(annObject.color);
        if (annObject?.opacity !== undefined) setUnderlineOpacity(Math.round((annObject.opacity ?? 1) * 100));
      } else if (type === 12) {
        if (annObject?.color) setStrikeoutColor(annObject.color);
        if (annObject?.opacity !== undefined) setStrikeoutOpacity(Math.round((annObject.opacity ?? 1) * 100));
      } else if (type === 11) {
        if (annObject?.color) setSquigglyColor(annObject.color);
        if (annObject?.opacity !== undefined) setSquigglyOpacity(Math.round((annObject.opacity ?? 1) * 100));
      }

      if ([4, 5, 6, 7, 8].includes(type)) {
        const stroke = (annObject?.strokeColor as string | undefined) ?? (annObject?.color as string | undefined);
        if (stroke) setShapeStrokeColor(stroke);
        if ([5, 6, 7].includes(type)) {
          const fill = (annObject?.color as string | undefined) ?? (annObject?.fillColor as string | undefined);
          if (fill) setShapeFillColor(fill);
        }
        const opacity =
          annObject?.opacity !== undefined ? Math.round((annObject.opacity ?? 1) * 100) : undefined;
        const strokeOpacityValue =
          annObject?.strokeOpacity !== undefined
            ? Math.round((annObject.strokeOpacity ?? 1) * 100)
            : undefined;
        const fillOpacityValue =
          annObject?.fillOpacity !== undefined ? Math.round((annObject.fillOpacity ?? 1) * 100) : undefined;
        if (opacity !== undefined) {
          setShapeOpacity(opacity);
          setShapeStrokeOpacity(strokeOpacityValue ?? opacity);
          setShapeFillOpacity(fillOpacityValue ?? opacity);
        } else {
          if (strokeOpacityValue !== undefined) setShapeStrokeOpacity(strokeOpacityValue);
          if (fillOpacityValue !== undefined) setShapeFillOpacity(fillOpacityValue);
        }
      }

      const matchingTool = derivedTool;
      const stayOnPlacement = shouldStayOnPlacementTool(annObject, matchingTool);
      if (matchingTool && activeToolRef.current !== 'select' && !stayOnPlacement) {
        activeToolRef.current = 'select';
        setActiveTool('select');
        // Immediately enable select tool to avoid re-entering placement after creation.
        annotationApiRef.current?.activateAnnotationTool?.('select');
      } else if (activeToolRef.current === 'select') {
        // Keep the viewer in Select mode so clicking existing annotations does not re-enable placement.
        annotationApiRef.current?.activateAnnotationTool?.('select');
      }
    },
    [
      activeToolRef,
      deriveToolFromAnnotation,
      manualToolSwitch,
      setActiveTool,
      setInkWidth,
      setNoteBackgroundColor,
      setSelectedFontSize,
      setSelectedTextDraft,
      setShapeThickness,
      setTextBackgroundColor,
      setTextColor,
      setInkColor,
      setHighlightColor,
      setHighlightOpacity,
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
      setFreehandHighlighterWidth,
      shouldStayOnPlacementTool,
    ]
  );

  useEffect(() => {
    const api = annotationApiRef.current as any;
    if (!api) return;

    const checkSelection = () => {
      let ann: any = null;
      if (typeof api.getSelectedAnnotation === 'function') {
        try {
          ann = api.getSelectedAnnotation();
        } catch (error) {
          // Some builds of the annotation plugin can throw when reading
          // internal selection state (e.g., accessing `selectedUid` on
          // an undefined object). Treat this as "no current selection"
          // instead of crashing the annotations tool.
          // Only log unexpected errors - "No active document" is a common expected state during init
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('No active document')) {
            console.error('[useAnnotationSelection] getSelectedAnnotation failed:', error);
          }
          ann = null;
        }
      }
      const currentId = ann?.object?.id ?? ann?.id ?? null;
      if (currentId !== selectedAnnIdRef.current) {
        applySelectionFromAnnotation(ann ?? null);
      }
    };

    let interval: ReturnType<typeof setInterval> | null = null;

    if (typeof api.onAnnotationEvent === 'function') {
      const handler = (event: any) => {
        const ann = event?.annotation ?? event?.selectedAnnotation ?? null;
        const eventType = event?.type;
        switch (eventType) {
          case 'create':
          case 'add':
          case 'added':
          case 'created':
          case 'annotationCreated':
          case 'annotationAdded':
          case 'complete': {
            const eventAnn = ann ?? api.getSelectedAnnotation?.();
            applySelectionFromAnnotation(eventAnn);
            const currentTool = activeToolRef.current;
            const tool =
              deriveToolFromAnnotation((eventAnn as any)?.object ?? eventAnn ?? api.getSelectedAnnotation?.()) ||
              currentTool;
            const stayOnPlacement = shouldStayOnPlacementTool(eventAnn, tool);
            if (activeToolRef.current !== 'select' && !stayOnPlacement) {
              activeToolRef.current = 'select';
              setActiveTool('select');
              annotationApiRef.current?.activateAnnotationTool?.('select');
            }
            // Re-read selection after the viewer updates to ensure we have the full annotation object for the edit panel.
            setTimeout(() => {
              const selected = api.getSelectedAnnotation?.();
              applySelectionFromAnnotation(selected ?? eventAnn ?? null);
              const derivedAfter =
                deriveToolFromAnnotation((selected as any)?.object ?? selected ?? eventAnn ?? null) || activeToolRef.current;
              const stayOnPlacementAfter = shouldStayOnPlacementTool(selected ?? eventAnn ?? null, derivedAfter);
              if (activeToolRef.current !== 'select' && !stayOnPlacementAfter) {
                activeToolRef.current = 'select';
                setActiveTool('select');
                annotationApiRef.current?.activateAnnotationTool?.('select');
              }
            }, 50);
            break;
          }
          case 'select':
          case 'selected':
          case 'annotationSelected':
          case 'annotationClicked':
          case 'annotationTapped':
            applySelectionFromAnnotation(ann ?? api.getSelectedAnnotation?.());
            break;
          case 'deselect':
          case 'clearSelection':
            applySelectionFromAnnotation(null);
            break;
          case 'delete':
          case 'remove':
            if (ann?.id && ann.id === selectedAnnIdRef.current) {
              applySelectionFromAnnotation(null);
            }
            break;
          case 'update':
          case 'change':
            if (selectedAnnIdRef.current) {
              const current = api.getSelectedAnnotation?.();
              if (current) {
                applySelectionFromAnnotation(current);
              }
            }
            break;
          default:
            break;
        }
      };

      const unsubscribe = api.onAnnotationEvent(handler);
      interval = setInterval(checkSelection, 450);
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
        if (interval) clearInterval(interval);
      };
    }

    interval = setInterval(checkSelection, 350);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [annotationApiRef, applySelectionFromAnnotation]);

  return {
    selectedAnn,
    selectedAnnId,
    selectedAnnIdRef,
    setSelectedAnn,
    setSelectedAnnId,
    applySelectionFromAnnotation,
  };
}
