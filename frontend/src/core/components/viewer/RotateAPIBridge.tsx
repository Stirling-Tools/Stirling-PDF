import { useEffect, useState } from 'react';
import { useRotate } from '@embedpdf/plugin-rotate/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { DEFAULT_DOCUMENT_ID } from '@app/components/viewer/viewerConstants';

export function RotateAPIBridge() {
  const { provides: rotate, rotation } = useRotate(DEFAULT_DOCUMENT_ID);
  const { registerBridge } = useViewer();
  
  // Store state locally
  const [_localState, setLocalState] = useState({
    rotation: 0
  });

  useEffect(() => {
    if (rotate) {
      // Update local state
      const newState = {
        rotation
      };
      setLocalState(newState);

      // Register this bridge with ViewerContext
      registerBridge('rotation', {
        state: newState,
        api: {
          rotateForward: () => rotate.rotateForward(),
          rotateBackward: () => rotate.rotateBackward(),
          setRotation: (rotationValue: number) => rotate.setRotation(rotationValue),
          getRotation: () => rotation,
        }
      });
    }
  }, [rotate, rotation]);

  return null;
}