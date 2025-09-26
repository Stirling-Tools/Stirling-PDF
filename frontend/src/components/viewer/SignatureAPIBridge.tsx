import React, { useImperativeHandle, forwardRef, useEffect } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype, PdfStandardFont, PdfTextAlignment, PdfVerticalAlignment, uuidV4 } from '@embedpdf/models';
import { SignParameters } from '../../hooks/tools/sign/useSignParameters';
import { useSignature } from '../../contexts/SignatureContext';

export interface SignatureAPI {
  addImageSignature: (signatureData: string, x: number, y: number, width: number, height: number, pageIndex: number) => void;
  addTextSignature: (text: string, x: number, y: number, pageIndex: number) => void;
  activateDrawMode: () => void;
  activateSignaturePlacementMode: () => void;
  activateDeleteMode: () => void;
  deleteAnnotation: (annotationId: string, pageIndex: number) => void;
  updateDrawSettings: (color: string, size: number) => void;
  deactivateTools: () => void;
  applySignatureFromParameters: (params: SignParameters) => void;
}

export interface SignatureAPIBridgeProps {}

export const SignatureAPIBridge = forwardRef<SignatureAPI, SignatureAPIBridgeProps>((props, ref) => {
  const { provides: annotationApi } = useAnnotationCapability();
  const { signatureConfig, storeImageData } = useSignature();


  // Enable keyboard deletion of selected annotations
  useEffect(() => {
    if (!annotationApi) return;

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
  }, [annotationApi, storeImageData]);

  useImperativeHandle(ref, () => ({
    addImageSignature: (signatureData: string, x: number, y: number, width: number, height: number, pageIndex: number) => {
      if (!annotationApi) return;

      // Create image stamp annotation with proper image data
      console.log('Creating image annotation with data length:', signatureData?.length);

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

    addTextSignature: (text: string, x: number, y: number, pageIndex: number) => {
      if (!annotationApi) return;

      // Create text annotation for signature
      annotationApi.createAnnotation(pageIndex, {
        type: PdfAnnotationSubtype.FREETEXT,
        rect: {
          origin: { x, y },
          size: { width: 200, height: 50 }
        },
        contents: text,
        author: 'Digital Signature',
        fontSize: 16,
        fontColor: '#000000',
        fontFamily: PdfStandardFont.Helvetica,
        textAlign: PdfTextAlignment.Left,
        verticalAlign: PdfVerticalAlignment.Top,
        opacity: 1,
        pageIndex: pageIndex,
        id: uuidV4(),
        created: new Date(),
        customData: {
          signatureText: text,
          signatureType: 'text'
        }
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
          // Try different tool names for text annotations
          const textToolNames = ['freetext', 'text', 'textbox', 'annotation-text'];
          let activatedTool = null;

          for (const toolName of textToolNames) {
            annotationApi.setActiveTool(toolName);
            const tool = annotationApi.getActiveTool();

            if (tool && tool.id === toolName) {
              activatedTool = tool;
              annotationApi.setToolDefaults(toolName, {
                contents: signatureConfig.signerName,
                fontSize: signatureConfig.fontSize || 16,
                fontFamily: signatureConfig.fontFamily === 'Times-Roman' ? PdfStandardFont.Times_Roman :
                          signatureConfig.fontFamily === 'Courier' ? PdfStandardFont.Courier :
                          PdfStandardFont.Helvetica,
                fontColor: '#000000',
              });
              break;
            }
          }

          if (!activatedTool) {
            // Fallback: create a simple text image as stamp
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const fontSize = signatureConfig.fontSize || 16;
              const fontFamily = signatureConfig.fontFamily || 'Helvetica';

              canvas.width = Math.max(200, signatureConfig.signerName.length * fontSize * 0.6);
              canvas.height = fontSize + 20;
              ctx.fillStyle = '#000000';
              ctx.font = `${fontSize}px ${fontFamily}`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(signatureConfig.signerName, 10, canvas.height / 2);
              const dataURL = canvas.toDataURL();

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

    applySignatureFromParameters: (params: SignParameters) => {
      if (!annotationApi || !params.signaturePosition) return;

      const { x, y, width, height, page } = params.signaturePosition;

      switch (params.signatureType) {
        case 'image':
          if (params.signatureData) {
            const annotationId = uuidV4();

            // Store image data in our persistent store
            storeImageData(annotationId, params.signatureData);

            annotationApi.createAnnotation(page, {
              type: PdfAnnotationSubtype.STAMP,
              rect: {
                origin: { x, y },
                size: { width, height }
              },
              author: 'Digital Signature',
              subject: `Digital Signature - ${params.reason || 'Document signing'}`,
              pageIndex: page,
              id: annotationId,
              created: new Date(),
              // Store image data in multiple places to ensure history captures it
              imageSrc: params.signatureData,
              contents: params.signatureData, // Some annotation systems use contents
              data: params.signatureData, // Try data field
              imageData: params.signatureData, // Try imageData field
              appearance: params.signatureData // Try appearance field
            });

            // Switch to select mode after placing signature so it can be easily deleted
            setTimeout(() => {
              annotationApi.setActiveTool('select');
            }, 100);
          }
          break;

        case 'text':
          if (params.signerName) {
            annotationApi.createAnnotation(page, {
              type: PdfAnnotationSubtype.FREETEXT,
              rect: {
                origin: { x, y },
                size: { width, height }
              },
              contents: params.signerName,
              author: 'Digital Signature',
              fontSize: 16,
              fontColor: '#000000',
              fontFamily: PdfStandardFont.Helvetica,
              textAlign: PdfTextAlignment.Left,
              verticalAlign: PdfVerticalAlignment.Top,
              opacity: 1,
              pageIndex: page,
              id: uuidV4(),
              created: new Date(),
              customData: {
                signatureText: params.signerName,
                signatureType: 'text'
              }
            });

            // Switch to select mode after placing signature so it can be easily deleted
            setTimeout(() => {
              annotationApi.setActiveTool('select');
            }, 100);
          }
          break;

        case 'draw':
          // For draw mode, we activate the tool and let user draw
          annotationApi.setActiveTool('ink');
          break;
      }
    },
  }), [annotationApi, signatureConfig]);


  return null; // This is a bridge component with no UI
});

SignatureAPIBridge.displayName = 'SignatureAPIBridge';