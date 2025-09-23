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
  const { signatureConfig } = useSignature();

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

          if (id) {
            annotationApi.deleteAnnotation(pageIndex, id);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [annotationApi]);

  useImperativeHandle(ref, () => ({
    addImageSignature: (signatureData: string, x: number, y: number, width: number, height: number, pageIndex: number) => {
      if (!annotationApi) return;

      // Create image stamp annotation
      annotationApi.createAnnotation(pageIndex, {
        type: PdfAnnotationSubtype.STAMP,
        rect: {
          origin: { x, y },
          size: { width, height }
        },
        author: 'Digital Signature',
        subject: 'Digital Signature',
        pageIndex: pageIndex,
        id: uuidV4(),
        created: new Date(),
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
      console.log('SignatureAPIBridge.activateSignaturePlacementMode called');
      console.log('annotationApi:', !!annotationApi, 'signatureConfig:', !!signatureConfig);
      if (!annotationApi || !signatureConfig) return;

      try {
        console.log('Signature type:', signatureConfig.signatureType);
        console.log('Font settings:', { fontFamily: signatureConfig.fontFamily, fontSize: signatureConfig.fontSize });
        if (signatureConfig.signatureType === 'text' && signatureConfig.signerName) {
          console.log('Trying different text tool names');

          // Try different tool names for text annotations
          const textToolNames = ['freetext', 'text', 'textbox', 'annotation-text'];
          let activatedTool = null;

          for (const toolName of textToolNames) {
            console.log(`Trying tool: ${toolName}`);
            annotationApi.setActiveTool(toolName);
            const tool = annotationApi.getActiveTool();
            console.log(`Tool result for ${toolName}:`, tool);

            if (tool && tool.id === toolName) {
              activatedTool = tool;
              console.log(`Successfully activated ${toolName}`);
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
            console.log('No text tool could be activated, trying stamp as fallback');
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
          console.log('Activating stamp tool');
          // Use stamp tool for image/canvas signatures
          annotationApi.setActiveTool('stamp');
          const activeTool = annotationApi.getActiveTool();
          console.log('Stamp tool activated:', activeTool);
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
            annotationApi.createAnnotation(page, {
              type: PdfAnnotationSubtype.STAMP,
              rect: {
                origin: { x, y },
                size: { width, height }
              },
              author: 'Digital Signature',
              subject: `Digital Signature - ${params.reason || 'Document signing'}`,
              pageIndex: page,
              id: uuidV4(),
              created: new Date(),
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