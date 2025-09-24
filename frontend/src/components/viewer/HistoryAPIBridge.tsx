import React, { useImperativeHandle, forwardRef, useEffect } from 'react';
import { useHistoryCapability } from '@embedpdf/plugin-history/react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useSignature } from '../../contexts/SignatureContext';

export interface HistoryAPI {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export interface HistoryAPIBridgeProps {}

export const HistoryAPIBridge = forwardRef<HistoryAPI, HistoryAPIBridgeProps>((props, ref) => {
  const { provides: historyApi } = useHistoryCapability();
  const { provides: annotationApi } = useAnnotationCapability();
  const { getImageData } = useSignature();


  useImperativeHandle(ref, () => ({
    undo: () => {
      if (historyApi) {
        historyApi.undo();

        // Restore image data for STAMP annotations after undo
        setTimeout(() => {
          if (!annotationApi) return;

          for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
            const pageAnnotationsTask = annotationApi.getPageAnnotations?.({ pageIndex });
            if (pageAnnotationsTask) {
              pageAnnotationsTask.toPromise().then((pageAnnotations: any) => {
                if (pageAnnotations) {
                  pageAnnotations.forEach((ann: any) => {
                    if (ann.type === 13) {
                      const storedImageData = getImageData(ann.id);

                      if (storedImageData && (!ann.imageSrc || ann.imageSrc !== storedImageData)) {
                        const originalData = {
                          type: ann.type,
                          rect: ann.rect,
                          author: ann.author || 'Digital Signature',
                          subject: ann.subject || 'Digital Signature',
                          pageIndex: pageIndex,
                          id: ann.id,
                          created: ann.created || new Date(),
                          imageSrc: storedImageData
                        };

                        annotationApi.deleteAnnotation(pageIndex, ann.id);
                        setTimeout(() => {
                          annotationApi.createAnnotation(pageIndex, originalData);
                        }, 50);
                      }
                    }
                  });
                }
              }).catch((error: any) => {
                console.error(`Failed to get annotations for page ${pageIndex}:`, error);
              });
            }
          }
        }, 200);
      }
    },

    redo: () => {
      if (historyApi) {
        historyApi.redo();
      }
    },

    canUndo: () => {
      return historyApi ? historyApi.canUndo() : false;
    },

    canRedo: () => {
      return historyApi ? historyApi.canRedo() : false;
    },
  }), [historyApi]);

  return null; // This is a bridge component with no UI
});

HistoryAPIBridge.displayName = 'HistoryAPIBridge';