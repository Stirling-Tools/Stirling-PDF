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
  deactivateTools: () => void;
  applySignatureFromParameters: (params: SignParameters) => void;
}

export interface SignatureAPIBridgeProps {}

export const SignatureAPIBridge = forwardRef<SignatureAPI, SignatureAPIBridgeProps>((props, ref) => {
  const { provides: annotationApi } = useAnnotationCapability();
  const { signatureConfig } = useSignature();

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
    },

    activateSignaturePlacementMode: () => {
      console.log('SignatureAPIBridge.activateSignaturePlacementMode called');
      console.log('annotationApi:', !!annotationApi, 'signatureConfig:', !!signatureConfig);
      if (!annotationApi || !signatureConfig) return;

      try {
        console.log('Signature type:', signatureConfig.signatureType);
        if (signatureConfig.signatureType === 'text' && signatureConfig.signerName) {
          console.log('Activating freetext tool');
          // Use freetext tool for text signatures
          annotationApi.setActiveTool('freetext');
          const activeTool = annotationApi.getActiveTool();
          console.log('Freetext tool activated:', activeTool);
          if (activeTool && activeTool.id === 'freetext') {
            annotationApi.setToolDefaults('freetext', {
              contents: signatureConfig.signerName,
              fontSize: 16,
              fontFamily: PdfStandardFont.Helvetica,
              fontColor: '#000000',
            });
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