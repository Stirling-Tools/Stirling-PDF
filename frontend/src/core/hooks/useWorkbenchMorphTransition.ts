import { useCallback } from 'react';
import { useWorkbenchTransition as useMorphContext } from '@app/contexts/WorkbenchTransitionContext';
import type { BaseWorkbenchType } from '../types/workbench';

/**
 * Hook for initiating morphing transitions between workbenches
 *
 * Coordinates the animation sequence:
 * 1. Register source elements (current view)
 * 2. Start transition (capture snapshots)
 * 3. Swap view content
 * 4. Register target elements (new view)
 * 5. Morph animation plays
 * 6. Complete transition
 */
export function useWorkbenchMorphTransition() {
  const { startTransition } = useMorphContext();

  const transition = useCallback(
    async (from: BaseWorkbenchType, to: BaseWorkbenchType, onViewChange?: () => void) => {
      // Start transition and pass view change callback
      // The callback will be called after source snapshots are captured
      // and before target snapshots are captured
      await startTransition(from, to, onViewChange);
    },
    [startTransition]
  );

  return { transition };
}
