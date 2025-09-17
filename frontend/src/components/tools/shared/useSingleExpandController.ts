import { useEffect, useMemo, useCallback } from 'react';
import { useSingleExpansion } from './SingleExpansionContext';

export function useSingleExpandController(opts: {
  filesVisible: boolean;
  stepVisibilities: (boolean | undefined)[];
  resultsVisible?: boolean;
}) {
  const { enabled, expandedStep, setExpandedStep } = useSingleExpansion();

  const visibleIds = useMemo(
    () => [
      ...(opts.filesVisible === false ? [] : ['files']),
      ...opts.stepVisibilities.map((v, i) => (v === false ? null : `step-${i}`)).filter(Boolean) as string[],
      ...(opts.resultsVisible ? ['review'] : []),
    ],
    [opts.filesVisible, opts.stepVisibilities, opts.resultsVisible]
  );

  // If single-expand is turned off, clear selection
  useEffect(() => {
    if (!enabled && expandedStep !== null) setExpandedStep(null);
  }, [enabled]); 

  // If the selected step becomes invisible, clear it
  useEffect(() => {
    if (!enabled) return;
    if (expandedStep && !visibleIds.includes(expandedStep)) {
      setExpandedStep(null);
    }
  }, [enabled, expandedStep, visibleIds]); 

  // When results become visible, automatically expand them and collapse all others
  useEffect(() => {
    if (!enabled) return;
    if (opts.resultsVisible && expandedStep !== 'review') {
      setExpandedStep('review');
    }
  }, [enabled, opts.resultsVisible, expandedStep, setExpandedStep]);

  const onToggle = useCallback((stepId: string, original?: () => void) => {
    if (enabled) {
      // If Files is the only visible step, don't allow it to be collapsed
      if (stepId === 'files' && visibleIds.length === 1) {
        return; // Don't collapse the only visible step
      }
      setExpandedStep(expandedStep === stepId ? null : stepId);
    }
    original?.();
  }, [enabled, expandedStep, setExpandedStep, visibleIds]);

  const isCollapsed = useCallback((stepId: string, original?: boolean) => {
    if (!enabled) return original ?? false;
    
    // If Files is the only visible step, never collapse it
    if (stepId === 'files' && visibleIds.length === 1) {
      return false;
    }
    
    if (expandedStep == null) return true;
    return expandedStep !== stepId;
  }, [enabled, expandedStep, visibleIds]);

  return { visibleIds, onToggle, isCollapsed };
}
