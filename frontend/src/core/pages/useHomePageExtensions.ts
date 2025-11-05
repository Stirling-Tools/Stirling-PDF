import { useEffect } from 'react';

/**
 * Extension point for HomePage behaviour.
 * Core version does nothing.
 */
export function useHomePageExtensions(_openedFile?: File | null) {
  useEffect(() => {
  }, [_openedFile]);
}
