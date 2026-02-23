import { useEffect, useRef } from 'react';
import { useRotate } from '@embedpdf/plugin-rotate/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Connects the PDF rotation plugin to the shared ViewerContext.
 */
export function RotateAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();

  // Don't render the inner component until we have a valid document ID and document is ready
  if (!activeDocumentId || !documentReady) {
    return null;
  }

  return <RotateAPIBridgeInner documentId={activeDocumentId} />;
}

function RotateAPIBridgeInner({ documentId }: { documentId: string }) {
  const { provides: rotate, rotation } = useRotate(documentId);
  const { registerBridge } = useViewer();

  // Keep rotate ref updated to avoid re-running effect when object reference changes
  const rotateRef = useRef(rotate);
  useEffect(() => {
    rotateRef.current = rotate;
  }, [rotate]);

  useEffect(() => {
    const currentRotate = rotateRef.current;
    if (currentRotate) {
      const newState = {
        rotation
      };

      // Register this bridge with ViewerContext
      registerBridge('rotation', {
        state: newState,
        api: {
          rotateForward: () => currentRotate.rotateForward(),
          rotateBackward: () => currentRotate.rotateBackward(),
          setRotation: (rotationValue: number) => currentRotate.setRotation(rotationValue),
          getRotation: () => rotation,
        }
      });
    }

    return () => {
      registerBridge('rotation', null);
    };
  }, [rotation, registerBridge]);

  return null;
}
