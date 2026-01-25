import { useEffect, useRef } from 'react';
import { useRotate } from '@embedpdf/plugin-rotate/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

export function RotateAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  
  // Don't render the inner component until we have a valid document ID
  if (!activeDocumentId) {
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
  }, [rotation, registerBridge]);

  return null;
}