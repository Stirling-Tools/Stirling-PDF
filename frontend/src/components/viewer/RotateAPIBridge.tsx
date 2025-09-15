import { useEffect } from 'react';
import { useRotate } from '@embedpdf/plugin-rotate/react';

/**
 * Component that runs inside EmbedPDF context and exports rotate controls globally
 */
export function RotateAPIBridge() {
  const { provides: rotate, rotation } = useRotate();

  useEffect(() => {
    if (rotate) {
      // Export rotate controls to global window for right rail access
      window.embedPdfRotate = {
        rotateForward: () => rotate.rotateForward(),
        rotateBackward: () => rotate.rotateBackward(),
        setRotation: (rotationValue: number) => rotate.setRotation(rotationValue),
        getRotation: () => rotation,
      };
    }
  }, [rotate, rotation]);

  return null;
}