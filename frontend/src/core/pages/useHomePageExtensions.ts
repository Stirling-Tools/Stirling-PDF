import { useEffect } from 'react';

/**
 * Extension point for HomePage behaviour.
 * Core version does nothing.
 */
export function useHomePageExtensions(_openedFile?: File | null) {
  // No-op in core/web builds
  useEffect(() => {
    // Desktop override will handle opened files
  }, [_openedFile]);
}
