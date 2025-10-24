import { useEffect, useState } from 'react';
import { useRotate } from '@embedpdf/plugin-rotate/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and updates rotation state in ViewerContext
 */
export function RotateAPIBridge() {
  const { provides: rotate, rotation } = useRotate();
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