import React, { useImperativeHandle, forwardRef, useEffect } from 'react';
import { useHistoryCapability } from '@embedpdf/plugin-history/react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useSignature } from '../../contexts/SignatureContext';
import { uuidV4 } from '@embedpdf/models';

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
  const { getImageData, storeImageData } = useSignature();

  // Monitor annotation events to detect when annotations are restored
  useEffect(() => {
    if (!annotationApi) return;

    const handleAnnotationEvent = (event: any) => {
      const annotation = event.annotation;

      // Store image data for all STAMP annotations immediately when created or modified
      if (annotation && annotation.type === 13 && annotation.id && annotation.imageSrc) {
        const storedImageData = getImageData(annotation.id);
        if (!storedImageData || storedImageData !== annotation.imageSrc) {
          console.log('HistoryAPI: Storing image data for annotation', annotation.id);
          storeImageData(annotation.id, annotation.imageSrc);
        }
      }

      // Handle annotation restoration after undo operations
      if (event.type === 'create' && event.committed) {
        // Check if this is a STAMP annotation (signature) that might need image data restoration
        if (annotation && annotation.type === 13 && annotation.id) {
          const storedImageData = getImageData(annotation.id);

          // Delay the check to allow the annotation to be fully created
          setTimeout(() => {
            const currentStoredData = getImageData(annotation.id);
            // Check if the annotation lacks image data but we have it stored
            if (currentStoredData && (!annotation.imageSrc || annotation.imageSrc !== currentStoredData)) {
              console.log('HistoryAPI: Restoring image data for annotation', annotation.id);
              
              // Generate new ID to avoid React key conflicts
              const newId = uuidV4();

              // Recreation with stored image data
              const restoredData = {
                type: annotation.type,
                rect: annotation.rect,
                author: annotation.author || 'Digital Signature',
                subject: annotation.subject || 'Digital Signature',
                pageIndex: event.pageIndex,
                id: newId,
                created: annotation.created || new Date(),
                imageSrc: currentStoredData
              };

              // Update stored data to use new ID
              storeImageData(newId, currentStoredData);

              // Replace the annotation with one that has proper image data
              try {
                annotationApi.deleteAnnotation(event.pageIndex, annotation.id);
                // Small delay to ensure deletion completes
                setTimeout(() => {
                  annotationApi.createAnnotation(event.pageIndex, restoredData);
                }, 50);
              } catch (error) {
                console.error('HistoryAPI: Failed to restore annotation:', error);
              }
            }
          }, 100);
        }
      }
    };

    // Add the event listener
    annotationApi.onAnnotationEvent(handleAnnotationEvent);

    // Cleanup function
    return () => {
      // Note: EmbedPDF doesn't provide a way to remove event listeners
      // This is a limitation of the current API
    };
  }, [annotationApi, getImageData, storeImageData]);


  useImperativeHandle(ref, () => ({
    undo: () => {
      if (historyApi) {
        historyApi.undo();
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