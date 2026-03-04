import { useImperativeHandle, forwardRef, useEffect, useCallback, useRef, useState } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, uuidV4 } from '@embedpdf/models';
import { useSignature } from '@app/contexts/SignatureContext';
import type { SignatureAPI, AnnotationRect } from '@app/components/viewer/viewerTypes';
import type { SignParameters } from '@app/hooks/tools/sign/useSignParameters';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Connects the PDF signature (stamp/ink) tools to the shared ViewerContext and SignatureContext.
 */

// Minimum allowed width/height (in pixels) for a signature image or text stamp.
// This prevents rendering issues and ensures signatures are always visible and usable.
const MIN_SIGNATURE_DIMENSION = 12;

// Use 2x oversampling to improve text rendering quality (anti-aliasing) when generating signature images.
// This provides a good balance between visual fidelity and performance/memory usage.
const TEXT_OVERSAMPLE_FACTOR = 2;

const extractDataUrl = (value: unknown, depth = 0, visited: Set<unknown> = new Set()): string | undefined => {
  if (!value || depth > 6) return undefined;

  // Prevent circular references
  if (typeof value === 'object' && visited.has(value)) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.startsWith('data:image') ? value : undefined;
  }

  if (typeof value === 'object') {
    visited.add(value);

    if (Array.isArray(value)) {
      for (const entry of value) {
        const result = extractDataUrl(entry, depth + 1, visited);
        if (result) return result;
      }
    } else {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const result = extractDataUrl((value as Record<string, unknown>)[key], depth + 1, visited);
        if (result) return result;
      }
    }
  }

  return undefined;
};

const createTextStampImage = (
  config: SignParameters,
  displaySize?: { width: number; height: number } | null
): { dataUrl: string; pixelWidth: number; pixelHeight: number; displayWidth: number; displayHeight: number } | null => {
  const text = (config.signerName ?? '').trim();
  if (!text) {
    return null;
  }

  const fontSize = config.fontSize ?? 16;
  const fontFamily = config.fontFamily ?? 'Helvetica';
  const textColor = config.textColor ?? '#000000';

  const paddingX = Math.max(4, Math.round(fontSize * 0.8));
  const paddingY = Math.max(4, Math.round(fontSize * 0.6));

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) {
    return null;
  }

  measureCtx.font = `${fontSize}px ${fontFamily}`;
  const metrics = measureCtx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const naturalWidth = Math.max(MIN_SIGNATURE_DIMENSION, textWidth + paddingX * 2);
  const naturalHeight = Math.max(MIN_SIGNATURE_DIMENSION, Math.ceil(fontSize + paddingY * 2));

  const scale =
    displaySize && naturalWidth > 0 && naturalHeight > 0
      ? Math.min(displaySize.width / naturalWidth, displaySize.height / naturalHeight)
      : 1;

  const displayWidth = Math.max(MIN_SIGNATURE_DIMENSION, naturalWidth * scale);
  const displayHeight = Math.max(MIN_SIGNATURE_DIMENSION, naturalHeight * scale);

  const canvasWidth = Math.max(
    MIN_SIGNATURE_DIMENSION,
    Math.round(displayWidth * TEXT_OVERSAMPLE_FACTOR)
  );
  const canvasHeight = Math.max(
    MIN_SIGNATURE_DIMENSION,
    Math.round(displayHeight * TEXT_OVERSAMPLE_FACTOR)
  );

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const effectiveScale = scale * TEXT_OVERSAMPLE_FACTOR;
  ctx.scale(effectiveScale, effectiveScale);

  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = config.textAlign || 'left';
  ctx.textBaseline = 'middle';

  const horizontalPadding = paddingX;
  const verticalCenter = naturalHeight / 2;

  let xPosition = horizontalPadding;
  if (config.textAlign === 'center') {
    xPosition = naturalWidth / 2;
  } else if (config.textAlign === 'right') {
    xPosition = naturalWidth - horizontalPadding;
  }

  ctx.fillText(text, xPosition, verticalCenter);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    pixelWidth: canvasWidth,
    pixelHeight: canvasHeight,
    displayWidth,
    displayHeight,
  };
};

export const SignatureAPIBridge = forwardRef<SignatureAPI>(function SignatureAPIBridge(_, ref) {
  const { provides: annotationApi } = useAnnotationCapability();
  const { signatureConfig, storeImageData, isPlacementMode, placementPreviewSize, setSignaturesApplied } = useSignature();
  const { getZoomState, registerImmediateZoomUpdate } = useViewer();
  const documentReady = useDocumentReady();
  const [currentZoom, setCurrentZoom] = useState(() => getZoomState()?.currentZoom ?? 1);
  const lastStampImageRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentZoom(getZoomState()?.currentZoom ?? 1);
    const unregister = registerImmediateZoomUpdate(percent => {
      setCurrentZoom(Math.max(percent / 100, 0.01));
    });
    return () => {
      unregister?.();
    };
  }, [getZoomState, registerImmediateZoomUpdate]);

  const cssToPdfSize = useCallback(
    (size: { width: number; height: number }) => {
      const zoom = currentZoom || 1;
      const factor = 1 / zoom;
      return {
        width: size.width * factor,
        height: size.height * factor,
      };
    },
    [currentZoom]
  );

  const applyStampDefaults = useCallback(
    (imageSrc: string, subject: string, size?: { width: number; height: number }) => {
      if (!annotationApi) return;

      annotationApi.setActiveTool(null);
      annotationApi.setActiveTool('stamp');
      const stampTool = annotationApi.getActiveTool();
      if (stampTool && stampTool.id === 'stamp') {
        annotationApi.setToolDefaults('stamp', {
          imageSrc,
          subject,
          ...(size ? { imageSize: { width: size.width, height: size.height } } : {}),
        });
      }
    },
    [annotationApi]
  );

  const configureStampDefaults = useCallback(async () => {
    if (!annotationApi || !signatureConfig) {
      return;
    }

    try {
      if (signatureConfig.signatureType === 'text' && signatureConfig.signerName) {
        const textStamp = createTextStampImage(signatureConfig, placementPreviewSize);
        if (textStamp) {
          const displaySize =
            placementPreviewSize ?? {
              width: textStamp.displayWidth,
              height: textStamp.displayHeight,
            };
          const pdfSize = cssToPdfSize(displaySize);
          lastStampImageRef.current = textStamp.dataUrl;
          applyStampDefaults(textStamp.dataUrl, `Text Signature - ${signatureConfig.signerName}`, pdfSize);
        }
        return;
      }

      if (signatureConfig.signatureData) {
        const pdfSize = placementPreviewSize ? cssToPdfSize(placementPreviewSize) : undefined;
        lastStampImageRef.current = signatureConfig.signatureData;
        applyStampDefaults(signatureConfig.signatureData, `Digital Signature - ${signatureConfig.reason || 'Document signing'}`, pdfSize);
        return;
      }
    } catch (error) {
      console.error('Error preparing signature defaults:', error);
    }
  }, [annotationApi, signatureConfig, placementPreviewSize, applyStampDefaults, cssToPdfSize]);


  // Enable keyboard deletion of selected annotations
  useEffect(() => {
    // Always enable delete key when we have annotation API and are in sign mode
    if (!annotationApi || (isPlacementMode === undefined) || !documentReady) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip delete/backspace while a text input/textarea is focused (e.g., editing textbox)
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable = target?.getAttribute?.('contenteditable');
      if (tag === 'input' || tag === 'textarea' || editable === 'true') {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedAnnotation = annotationApi.getSelectedAnnotation?.();

        if (selectedAnnotation) {
          const annotation = selectedAnnotation as any;
          const pageIndex = annotation.object?.pageIndex || 0;
          const id = annotation.object?.id;

          // For STAMP annotations, ensure image data is preserved before deletion
          if (annotation.object?.type === 13 && id) {
            // Get current annotation data to ensure we have latest image data stored
            const pageAnnotationsTask = annotationApi.getPageAnnotations?.({ pageIndex });
            if (pageAnnotationsTask) {
              pageAnnotationsTask.toPromise().then((pageAnnotations: any) => {
                const currentAnn = pageAnnotations?.find((ann: any) => ann.id === id);
                if (currentAnn && currentAnn.imageSrc) {
                  // Ensure the image data is stored in our persistent store
                  storeImageData(id, currentAnn.imageSrc);
                }
              }).catch(console.error);
            }
          }

          // Use EmbedPDF's native deletion which should integrate with history
          if ((annotationApi as any).deleteSelected) {
            (annotationApi as any).deleteSelected();
          } else {
            // Fallback to direct deletion - less ideal for history
            if (id) {
              annotationApi.deleteAnnotation(pageIndex, id);
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [annotationApi, storeImageData, isPlacementMode]);

  useImperativeHandle(ref, () => ({
    addImageSignature: (signatureData: string, x: number, y: number, width: number, height: number, pageIndex: number) => {
      if (!annotationApi) return;

      // Create image stamp annotation with proper image data

      const annotationId = uuidV4();

      // Store image data in our persistent store
      storeImageData(annotationId, signatureData);

      annotationApi.createAnnotation(pageIndex, {
        type: PdfAnnotationSubtype.STAMP,
        rect: {
          origin: { x, y },
          size: { width, height }
        },
        author: 'Digital Signature',
        subject: 'Digital Signature',
        pageIndex: pageIndex,
        id: annotationId,
        created: new Date(),
        // Store image data in multiple places to ensure history captures it
        imageSrc: signatureData,
        contents: signatureData, // Some annotation systems use contents
        data: signatureData, // Try data field
        imageData: signatureData, // Try imageData field
        appearance: signatureData // Try appearance field
      });
    },

    activateDrawMode: () => {
      if (!annotationApi) return;

      // Activate the built-in ink tool for drawing
      annotationApi.setActiveTool('ink');

      // Set default ink tool properties (black color, 2px width)
      const activeTool = annotationApi.getActiveTool();
      if (activeTool && activeTool.id === 'ink') {
        annotationApi.setToolDefaults('ink', {
          color: '#000000',
          thickness: 2,
          lineWidth: 2,
          strokeWidth: 2,
          width: 2
        });
      }
    },

    activateSignaturePlacementMode: () => {
      if (!annotationApi || !signatureConfig) return;

      configureStampDefaults().catch((error) => {
        console.error('Error activating signature tool:', error);
      });
    },

    updateDrawSettings: (color: string, size: number) => {
      if (!annotationApi) return;

      // Always update ink tool defaults - use multiple property names for compatibility
      annotationApi.setToolDefaults('ink', {
        color: color,
        thickness: size,
        lineWidth: size,
        strokeWidth: size,
        width: size
      });

      // Force reactivate ink tool to ensure new settings take effect
      annotationApi.setActiveTool(null); // Deactivate first
      setTimeout(() => {
        annotationApi.setActiveTool('ink'); // Reactivate with new settings
      }, 50);
    },

    activateDeleteMode: () => {
      if (!annotationApi) return;
      // Activate selection tool to allow selecting and deleting annotations
      // Users can click annotations to select them, then press Delete key or right-click to delete
      annotationApi.setActiveTool('select');
    },

    deleteAnnotation: (annotationId: string, pageIndex: number) => {
      if (!annotationApi) return;

      // Before deleting, try to preserve image data for potential undo
      const pageAnnotationsTask = annotationApi.getPageAnnotations?.({ pageIndex });
      if (pageAnnotationsTask) {
        pageAnnotationsTask.toPromise().then((pageAnnotations: any) => {
          const annotation = pageAnnotations?.find((ann: any) => ann.id === annotationId);
          if (annotation && annotation.type === PdfAnnotationSubtype.STAMP && annotation.imageSrc) {
            // Store image data before deletion
            storeImageData(annotationId, annotation.imageSrc);
          }
        }).catch(console.error);
      }

      // Delete specific annotation by ID
      annotationApi.deleteAnnotation(pageIndex, annotationId);
    },

    deactivateTools: () => {
      if (!annotationApi) return;
      annotationApi.setActiveTool(null);
    },

    getPageAnnotations: async (pageIndex: number): Promise<any[]> => {
      if (!annotationApi || !annotationApi.getPageAnnotations) {
        console.warn('getPageAnnotations not available');
        return [];
      }

      try {
        const pageAnnotationsTask = annotationApi.getPageAnnotations({ pageIndex });
        if (pageAnnotationsTask && pageAnnotationsTask.toPromise) {
          const annotations = await pageAnnotationsTask.toPromise();
          return annotations || [];
        }
        return [];
      } catch (error) {
        console.error(`Error getting annotations for page ${pageIndex}:`, error);
        return [];
      }
    },

    moveAnnotation: (pageIndex: number, annotationId: string, newRect: AnnotationRect) => {
      if (!annotationApi) return;
      // v2.7.0: move signature stamp to newRect without regenerating the AP stream,
      // preserving the original appearance (image data stays intact).
      (annotationApi as any).moveAnnotation?.(pageIndex, annotationId, newRect);
    },
  }), [annotationApi, signatureConfig, placementPreviewSize, applyStampDefaults]);

  useEffect(() => {
    if (!annotationApi?.onAnnotationEvent || !documentReady) {
      return;
    }

    const unsubscribe = annotationApi.onAnnotationEvent(event => {
      if (event.type !== 'create' && event.type !== 'update') {
        return;
      }

      const annotation: any = event.annotation;
      const annotationId: string | undefined = annotation?.id;
      if (!annotationId) {
        return;
      }

      // Mark signatures as not applied when a new signature is placed
      if (event.type === 'create') {
        setSignaturesApplied(false);
      }

      const directData =
        extractDataUrl(annotation.imageSrc) ||
        extractDataUrl(annotation.imageData) ||
        extractDataUrl(annotation.appearance) ||
        extractDataUrl(annotation.stampData) ||
        extractDataUrl(annotation.contents) ||
        extractDataUrl(annotation.data) ||
        extractDataUrl(annotation.customData) ||
        extractDataUrl(annotation.asset);

      const dataToStore = directData || lastStampImageRef.current;
      if (dataToStore) {
        storeImageData(annotationId, dataToStore);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [annotationApi, storeImageData, setSignaturesApplied, documentReady]);

  useEffect(() => {
    if (!isPlacementMode || !documentReady) {
      return;
    }

    let cancelled = false;
    configureStampDefaults().catch((error) => {
      if (!cancelled) {
        console.error('Error updating signature defaults:', error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isPlacementMode, configureStampDefaults, placementPreviewSize, signatureConfig, documentReady]);


  return null; // This is a bridge component with no UI
});

SignatureAPIBridge.displayName = 'SignatureAPIBridge';
