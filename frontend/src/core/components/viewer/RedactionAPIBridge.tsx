import { useEffect, useRef } from 'react';
import { useRedaction } from '@embedpdf/plugin-redaction/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Bridge EmbedPDF redaction plugin to ViewerContext.
 * Registers minimal state and exposes raw API for mode toggling and apply/export.
 */
export function RedactionAPIBridge() {
  const { provides: redactionApi, state: redactionState } = useRedaction();
  const { registerBridge, redactionActions, getRedactionDesiredMode, triggerImmediateRedactionModeUpdate } = useViewer();
  const activeTypeRef = useRef<string | null>(null);
  const hasPendingRef = useRef<boolean>(false);
  const correctingRef = useRef(false);

  // Subscribe to redaction state changes if supported
  useEffect(() => {
    if (!redactionApi) return;
    let unsubscribe: (() => void) | undefined;
    try {
      const handler = (state: any) => {
        const prevActiveType = activeTypeRef.current;
        activeTypeRef.current = state?.activeType ?? null;
        
        // Map plugin activeType to our mode format
        const mappedMode: 'text' | 'area' | null = 
          state?.activeType === 'marqueeRedact' || state?.activeType === 'area' ? 'area' :
          state?.activeType === 'redactSelection' || state?.activeType === 'text' ? 'text' :
          null;

        try {
          const hasPending = Boolean(
            state?.hasPending === true ||
            (Array.isArray(state?.pending) && state.pending.length > 0) ||
            (typeof state?.pendingCount === 'number' && state.pendingCount > 0) ||
            (Array.isArray((state as any)?.pendingItems) && (state as any).pendingItems.length > 0)
          );
          hasPendingRef.current = hasPending;
        } catch { hasPendingRef.current = hasPendingRef.current; }

        // Update UI immediately when mode changes
        const prevMappedMode = prevActiveType === 'marqueeRedact' || prevActiveType === 'area' ? 'area' : prevActiveType === 'redactSelection' || prevActiveType === 'text' ? 'text' : null;
        if (mappedMode !== prevMappedMode) {
          triggerImmediateRedactionModeUpdate(mappedMode);
        }

        // Re-register to push updated state snapshot
        registerBridge('redaction', {
          state: { activeType: mappedMode, hasPending: hasPendingRef.current },
          api: redactionApi
        });

        // Keep desired mode active after actions like inline apply or drawing
        const desired = getRedactionDesiredMode();
        if (!desired || correctingRef.current) return;
        const isAreaActive = state?.activeType === 'marqueeRedact' || state?.activeType === 'area';
        const isTextActive = state?.activeType === 'redactSelection' || state?.activeType === 'text';
        // If plugin cleared the mode but we have a desired mode, re-activate immediately
        if ((desired === 'area' && !isAreaActive) || (desired === 'text' && !isTextActive)) {
          correctingRef.current = true;
          if (desired === 'area') {
            redactionActions.activateArea();
          } else {
            redactionActions.activateText();
          }
          setTimeout(() => { correctingRef.current = false; }, 150);
        }
      };
      if (typeof (redactionApi as any).onStateChange === 'function') {
        (redactionApi as any).onStateChange(handler);
        unsubscribe = () => {
          try { (redactionApi as any).offStateChange?.(handler); } catch {}
        };
      } else {
        // If plugin doesn't support subscriptions, register once
        registerBridge('redaction', { state: { activeType: null }, api: redactionApi });
      }
    } catch {
      // Best-effort registration
      registerBridge('redaction', { state: { activeType: null }, api: redactionApi });
    }

    return () => {
      try { unsubscribe?.(); } catch {}
    };
  }, [redactionApi, registerBridge, redactionActions, getRedactionDesiredMode, triggerImmediateRedactionModeUpdate]);

  // Sync initial state from plugin
  useEffect(() => {
    if (!redactionState || !redactionApi) return;
    const activeType = redactionState.activeType as any;
    const mappedMode: 'text' | 'area' | null = 
      activeType === 'marqueeRedact' || activeType === 'area' ? 'area' :
      activeType === 'redactSelection' || activeType === 'text' ? 'text' :
      null;
    
    activeTypeRef.current = activeType;
    triggerImmediateRedactionModeUpdate(mappedMode);
  }, [redactionState, triggerImmediateRedactionModeUpdate]);

  // Initial registration when API becomes available
  useEffect(() => {
    if (!redactionApi) return;
    const mappedMode: 'text' | 'area' | null = 
      activeTypeRef.current === 'marqueeRedact' || activeTypeRef.current === 'area' ? 'area' :
      activeTypeRef.current === 'redactSelection' || activeTypeRef.current === 'text' ? 'text' :
      null;
    registerBridge('redaction', {
      state: { activeType: mappedMode, hasPending: hasPendingRef.current },
      api: redactionApi
    });
  }, [redactionApi, registerBridge]);

  return null;
}


