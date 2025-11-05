import { useCallback, useEffect, useRef } from 'react';
import { useRedaction } from '@embedpdf/plugin-redaction/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Behavior contract:
 * - The *only* authority for the desired mode is the last toolbar button the user clicked.
 * - We persist that in localStorage and mirror it on document for quick reads.
 * - We never invert the user's choice during "create/pending/select" frames.
 * - After the plugin finishes its internal flip (end of draw, commit, etc),
 *   we nudge it back to the user's choice using a deferred restore (microtask + 2x rAF).
 */

const LS_KEY = 'redaction:lastChoice'; // 'redactSelection' | 'marqueeRedact'
type Mode = 'redactSelection' | 'marqueeRedact';

export function RedactionAPIBridge() {
  const { state, provides } = useRedaction();
  const { registerBridge } = useViewer();

  // live state ref
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // desired mode (last clicked)
  const lastChoiceRef = useRef<Mode | null>(
    (localStorage.getItem(LS_KEY) as Mode | null) ?? null
  );

  const setLastChoice = useCallback((mode: Mode) => {
    lastChoiceRef.current = mode;
    (document as any)._embedpdf_redactMode = mode; // local mirror only
  }, []);

  // bridge surface for other UI
  const bridgeRef = useRef<{ state: any; api: any } | null>(null);
  useEffect(() => {
    if (!provides) return;
    const bridge = {
      state: {
        isRedacting: stateRef.current.isRedacting,
        activeType: stateRef.current.activeType,
        pendingCount: stateRef.current.pendingCount,
        selected: stateRef.current.selected,
      },
      api: provides,
    };
    bridgeRef.current = bridge;
    registerBridge('redaction', bridge);
  }, [registerBridge, provides]);

  // keep bridge.state fresh
  const prev = useRef(bridgeRef.current?.state);
  useEffect(() => {
    if (!bridgeRef.current) return;
    const s = {
      isRedacting: state.isRedacting,
      activeType: state.activeType,
      pendingCount: state.pendingCount,
      selected: state.selected,
    };
    if (!prev.current ||
        prev.current.isRedacting !== s.isRedacting ||
        prev.current.activeType !== s.activeType ||
        prev.current.pendingCount !== s.pendingCount ||
        prev.current.selected !== s.selected) {
      bridgeRef.current.state = s;
      prev.current = s;
    }
  }, [state.isRedacting, state.activeType, state.pendingCount, state.selected]);

  // idempotent "set" using toggles (there is no official setter)
  const setMode = useCallback((target: Mode | null) => {
    if (!provides || !target) return;
    if (stateRef.current.activeType === target) return;

    const anyProv = provides as any;
    if (typeof anyProv.setActiveType === 'function') {
      anyProv.setActiveType(target);
      return;
    }
    target === 'marqueeRedact'
      ? provides.toggleMarqueeRedact?.()
      : provides.toggleRedactSelection?.();
  }, [provides]);

  // public mini-API for your toolbar
  useEffect(() => {
    if (!bridgeRef.current) return;
    (bridgeRef.current as any).apiBridge = {
      setLastClicked: (mode: Mode) => setLastChoice(mode),
      setMode,
      getLastClicked: () => lastChoiceRef.current,
    };
  }, [setMode, setLastChoice]);

  // defer helper: run after the plugin's own state churn
  const restoringRef = useRef(false);
  const deferRestore = useCallback(() => {
    if (restoringRef.current) return;
    restoringRef.current = true;
    // microtask + double rAF to reliably run *after* the plugin's flip
    Promise.resolve().then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const desired = lastChoiceRef.current;
          const s = stateRef.current;
          if (desired && s.activeType !== desired) {
            setMode(desired); // idempotent
          }
          setTimeout(() => { restoringRef.current = false; }, 60);
        });
      });
    });
  }, [setMode]);

  // remember user-initiated switches (when plugin reports a mode)
  useEffect(() => {
    if (!restoringRef.current) return;
    if (state.activeType === lastChoiceRef.current) {
      restoringRef.current = false;
    }
  }, [state.activeType]);

  // steer back to user's choice after *any* redaction event
  useEffect(() => {
    if (!provides) return;
    const off = provides.onRedactionEvent?.((_evt: any) => {
      // Mark dirty for your nav guard if you use one
      try { sessionStorage.setItem('redaction:dirty', 'true'); } catch {}
      // Always defer a restore — hover helper will temporarily pause drawing when needed
      deferRestore();
    });
    return () => { off && off(); };
  }, [provides, deferRestore]);

  // seed once on tool open
  useEffect(() => {
    if (!provides) return;
    const remembered = (localStorage.getItem(LS_KEY) as Mode | null) ?? null;
    if (remembered) {
      setLastChoice(remembered);
      // set immediately so first interaction is correct
      setMode(remembered);
    }
  }, [provides, setMode, setLastChoice]);

  return null;
}
