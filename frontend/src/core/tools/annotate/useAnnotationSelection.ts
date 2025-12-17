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
  setShapeThickness: (value: number) => void;
  setTextColor: (value: string) => void;
  setTextBackgroundColor: (value: string) => void;
  setNoteBackgroundColor: (value: string) => void;
}

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
}: UseAnnotationSelectionParams) {
  const [selectedAnn, setSelectedAnn] = useState<any | null>(null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const selectedAnnIdRef = useRef<string | null>(null);

  const applySelectionFromAnnotation = useCallback(
    (ann: any | null) => {
      const annObject = ann?.object ?? ann ?? null;
      const annId = annObject?.id ?? null;
      const type = annObject?.type;
      selectedAnnIdRef.current = annId;
      setSelectedAnnId(annId);
      setSelectedAnn(ann || null);

      if (annObject?.contents !== undefined) {
        setSelectedTextDraft(annObject.contents ?? '');
      }
      if (annObject?.fontSize !== undefined) {
        setSelectedFontSize(annObject.fontSize ?? 14);
      }
      if (type === 3) {
        const derivedTool = deriveToolFromAnnotation(annObject);
        const background = annObject?.backgroundColor as string | undefined;
        if (annObject?.textColor) {
          setTextColor(annObject.textColor);
        }
        if (derivedTool === 'note') {
          if (background) {
            setNoteBackgroundColor(background);
          }
        } else {
          setTextBackgroundColor(background || '');
        }
      }

      if (type === 15 && annObject?.strokeWidth !== undefined) {
        setInkWidth(annObject.strokeWidth ?? 2);
      } else if (type >= 4 && type <= 8 && annObject?.strokeWidth !== undefined) {
        setShapeThickness(annObject.strokeWidth ?? 1);
      }

      const matchingTool = deriveToolFromAnnotation(annObject);
      if (matchingTool && matchingTool !== activeToolRef.current && !manualToolSwitch.current) {
        setActiveTool(matchingTool);
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
    ]
  );

  useEffect(() => {
    const api = annotationApiRef.current as any;
    if (!api) return;

    if (typeof api.onAnnotationEvent === 'function') {
      const handler = (event: any) => {
        const ann = event?.annotation ?? event?.selectedAnnotation ?? null;
        switch (event?.type) {
          case 'select':
          case 'selected':
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
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }

    const interval = setInterval(() => {
      const ann = api.getSelectedAnnotation?.();
      if ((ann?.object?.id ?? null) !== selectedAnnIdRef.current) {
        applySelectionFromAnnotation(ann ?? null);
      }
    }, 350);
    return () => clearInterval(interval);
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
