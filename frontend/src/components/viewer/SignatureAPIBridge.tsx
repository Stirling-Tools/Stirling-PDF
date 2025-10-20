import { useImperativeHandle, forwardRef, useEffect } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, uuidV4 } from '@embedpdf/models';
import { useSignature } from '../../contexts/SignatureContext';
import type { SignatureAPI } from './viewerTypes';

export const SignatureAPIBridge = forwardRef<SignatureAPI>(function SignatureAPIBridge(_, ref) {
  const { provides: annotationApi } = useAnnotationCapability();
  const { signatureConfig, storeImageData, isPlacementMode } = useSignature();


  // Enable keyboard deletion of selected annotations
  useEffect(() => {
    // Always enable delete key when we have annotation API and are in sign mode
    if (!annotationApi || (isPlacementMode === undefined)) return;

    const handleKeyDown = (event: KeyboardEvent) => {
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

      try {
        if (signatureConfig.signatureType === 'text' && signatureConfig.signerName) {
          // Skip native text tools - always use stamp for consistent sizing
          const activatedTool = null;

          if (!activatedTool) {
            // Create text image as stamp with actual pixel size matching desired display size
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const baseFontSize = signatureConfig.fontSize || 16;
              const fontFamily = signatureConfig.fontFamily || 'Helvetica';
              const textColor = signatureConfig.textColor || '#000000';

              // Canvas pixel size = display size (EmbedPDF uses pixel dimensions directly)
              canvas.width = Math.max(200, signatureConfig.signerName.length * baseFontSize * 0.6);
              canvas.height = baseFontSize + 20;

              ctx.fillStyle = textColor;
              ctx.font = `${baseFontSize}px ${fontFamily}`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(signatureConfig.signerName, 10, canvas.height / 2);
              const dataURL = canvas.toDataURL();

              // Deactivate and reactivate to force refresh
              annotationApi.setActiveTool(null);
              annotationApi.setActiveTool('stamp');
              const stampTool = annotationApi.getActiveTool();
              if (stampTool && stampTool.id === 'stamp') {
                annotationApi.setToolDefaults('stamp', {
                  imageSrc: dataURL,
                  subject: `Text Signature - ${signatureConfig.signerName}`,
                });
              }
            }
          }
        } else if (signatureConfig.signatureData) {
          // Use stamp tool for image/canvas signatures
          annotationApi.setActiveTool('stamp');
          const activeTool = annotationApi.getActiveTool();

          if (activeTool && activeTool.id === 'stamp') {
            annotationApi.setToolDefaults('stamp', {
              imageSrc: signatureConfig.signatureData,
              subject: `Digital Signature - ${signatureConfig.reason || 'Document signing'}`,
            });
          }
        }
      } catch (error) {
        console.error('Error activating signature tool:', error);
      }
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
          if (annotation && annotation.type === 13 && annotation.imageSrc) {
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
  }), [annotationApi, signatureConfig]);


  return null; // This is a bridge component with no UI
});

export type { SignatureAPI } from './viewerTypes';

SignatureAPIBridge.displayName = 'SignatureAPIBridge';
