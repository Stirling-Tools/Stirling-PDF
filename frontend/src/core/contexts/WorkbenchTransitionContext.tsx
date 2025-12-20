import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { BaseWorkbenchType } from '../types/workbench';

/**
 * Element snapshot for morphing animations
 */
export interface ElementSnapshot {
  id: string;
  rect: DOMRect;
  element: HTMLElement;
  thumbnail?: string;
  metadata?: Record<string, any>;
}

/**
 * Transition state tracking
 */
interface TransitionState {
  isTransitioning: boolean;
  fromWorkbench: BaseWorkbenchType | null;
  toWorkbench: BaseWorkbenchType | null;
  sourceSnapshots: ElementSnapshot[];
  targetSnapshots: ElementSnapshot[];
}

interface WorkbenchTransitionContextValue {
  // Transition state
  transitionState: TransitionState;

  // Register elements for morphing
  registerSourceElement: (id: string, element: HTMLElement, metadata?: Record<string, any>) => void;
  registerTargetElement: (id: string, element: HTMLElement, metadata?: Record<string, any>) => void;

  // Initiate transition
  startTransition: (from: BaseWorkbenchType, to: BaseWorkbenchType, onViewChange?: () => void) => Promise<void>;
  completeTransition: () => void;

  // Get morph pairs
  getMorphPairs: () => Array<{ source: ElementSnapshot; target: ElementSnapshot }>;
}

const WorkbenchTransitionContext = createContext<WorkbenchTransitionContextValue | null>(null);

export function useWorkbenchTransition() {
  const context = useContext(WorkbenchTransitionContext);
  if (!context) {
    throw new Error('useWorkbenchTransition must be used within WorkbenchTransitionProvider');
  }
  return context;
}

interface WorkbenchTransitionProviderProps {
  children: React.ReactNode;
}

const MAX_MORPH_ELEMENTS = 40; // cap clones to what can reasonably be on screen

export function WorkbenchTransitionProvider({ children }: WorkbenchTransitionProviderProps) {
  const [transitionState, setTransitionState] = useState<TransitionState>({
    isTransitioning: false,
    fromWorkbench: null,
    toWorkbench: null,
    sourceSnapshots: [],
    targetSnapshots: [],
  });

  // Use refs to store element registrations
  const sourceElementsRef = useRef<Map<string, { element: HTMLElement; metadata?: Record<string, any> }>>(new Map());
  const targetElementsRef = useRef<Map<string, { element: HTMLElement; metadata?: Record<string, any> }>>(new Map());

  const registerSourceElement = useCallback((id: string, element: HTMLElement, metadata?: Record<string, any>) => {
    sourceElementsRef.current.set(id, { element, metadata });
    if (process.env.NODE_ENV === 'development') {
      console.log('[WorkbenchTransition] Source registered', { id, fileId: metadata?.fileId, type: metadata?.type });
    }
  }, []);

  const registerTargetElement = useCallback((id: string, element: HTMLElement, metadata?: Record<string, any>) => {
    targetElementsRef.current.set(id, { element, metadata });
    if (process.env.NODE_ENV === 'development') {
      console.log('[WorkbenchTransition] Target registered', { id, fileId: metadata?.fileId, type: metadata?.type, page: metadata?.pageNumber });
    }
  }, []);

  const captureSnapshot = useCallback((id: string, element: HTMLElement, metadata?: Record<string, any>): ElementSnapshot => {
    const rect = element.getBoundingClientRect();

    // Try to capture thumbnail if it's an image or provided metadata
    let thumbnail: string | undefined;
    const img = element.querySelector('img');
    if (img && img.src) {
      thumbnail = img.src;
    } else if (metadata?.thumbnail) {
      thumbnail = metadata.thumbnail;
    }

    return {
      id,
      rect,
      element,
      thumbnail,
      metadata,
    };
  }, []);

  const startTransition = useCallback(async (from: BaseWorkbenchType, to: BaseWorkbenchType, onViewChange?: () => void) => {
    const waitForNextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const hasTargetsOfType = (type: string) => {
      for (const [, data] of targetElementsRef.current) {
        if (data.metadata?.type === type) return true;
      }
      return false;
    };

    // Capture source snapshots
    const sourceSnapshots: ElementSnapshot[] = [];
    sourceElementsRef.current.forEach((data, id) => {
      if (sourceSnapshots.length >= MAX_MORPH_ELEMENTS) return;
      if (data.element.offsetParent !== null) { // Only capture visible elements
        sourceSnapshots.push(captureSnapshot(id, data.element, data.metadata));
      }
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[WorkbenchTransition] Captured sources', sourceSnapshots.length);
    }

    setTransitionState({
      isTransitioning: true,
      fromWorkbench: from,
      toWorkbench: to,
      sourceSnapshots,
      targetSnapshots: [],
    });

    // Call the view change callback to mount the new view
    onViewChange?.();

    // Give the new view a tick to mount before we look for targets
    await waitForNextPaint();

    // Helper to scan DOM as a fallback in case targets haven't registered yet
    const scanForTargets = () => {
      let added = 0;
      const elements = document.querySelectorAll('[data-morph-id]');
      elements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const morphId = htmlEl.dataset.morphId;
        const fileId = htmlEl.dataset.morphFileId;
        const pageNumber = htmlEl.dataset.morphPageNumber;
        const type = htmlEl.dataset.morphType;

        if (morphId && fileId) {
          const metadata: Record<string, any> = { fileId, type };
          if (pageNumber) {
            metadata.pageNumber = parseInt(pageNumber);
          }

          // Preserve any explicit registration, otherwise add from scan
          if (!targetElementsRef.current.has(morphId)) {
            targetElementsRef.current.set(morphId, { element: htmlEl, metadata });
            added++;
          }
        }
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[WorkbenchTransition] DOM scan found', elements.length, 'morphables; added', added);
      }
    };

    // Wait for target registrations coming from useMorphElement (and fall back to DOM scan)
    const startTime = performance.now();
    const maxWaitMs = 1200; // shorter wait so animation can start quicker
    while (performance.now() - startTime < maxWaitMs) {
      if (targetElementsRef.current.size > 0) break;
      scanForTargets();
      await waitForNextPaint();
    }

    // If we are transitioning to pageEditor, prefer to wait for page targets
    if (to === 'pageEditor') {
      const typeWaitStart = performance.now();
      const typeWaitMs = 400; // brief grace period to pick up page targets
      while (!hasTargetsOfType('page') && performance.now() - typeWaitStart < typeWaitMs) {
        scanForTargets();
        await waitForNextPaint();
      }
    }

    // If we are transitioning to fileEditor, prefer to wait for file targets
    if (to === 'fileEditor') {
      const typeWaitStart = performance.now();
      const typeWaitMs = 400; // brief grace period to pick up file targets
      while (!hasTargetsOfType('file') && performance.now() - typeWaitStart < typeWaitMs) {
        scanForTargets();
        await waitForNextPaint();
      }
    }

    // If we are transitioning to viewer, also wait briefly for file targets (viewer anchor)
    if (to === 'viewer') {
      const typeWaitStart = performance.now();
      const typeWaitMs = 400;
      while (!hasTargetsOfType('file') && performance.now() - typeWaitStart < typeWaitMs) {
        scanForTargets();
        await waitForNextPaint();
      }
    }

    // One final scan after wait to pick up any late mounts
    scanForTargets();
    if (process.env.NODE_ENV === 'development') {
      console.log('[WorkbenchTransition] Targets registered after wait:', targetElementsRef.current.size);
    }

    // Give targets one more paint so layout stabilizes before measuring
    await waitForNextPaint();

    // Allow layout to settle so we capture accurate positions
    await waitForNextPaint();

    // Capture target snapshots
    console.log('[WorkbenchTransition] Capturing targets. Found:', targetElementsRef.current.size);
    const targetSnapshots: ElementSnapshot[] = [];
    targetElementsRef.current.forEach((data, id) => {
      if (targetSnapshots.length >= MAX_MORPH_ELEMENTS) return;
      if (data.element.offsetParent !== null) {
        targetSnapshots.push(captureSnapshot(id, data.element, data.metadata));
      }
    });

    // If nothing was visible, fall back to first few elements regardless of viewport
    if (targetSnapshots.length === 0 && targetElementsRef.current.size > 0) {
      let count = 0;
      targetElementsRef.current.forEach((data, id) => {
        if (count >= Math.min(MAX_MORPH_ELEMENTS, 12)) return;
        const snap = captureSnapshot(id, data.element, data.metadata);
        targetSnapshots.push(snap);
        count++;
      });
    }
    console.log('[WorkbenchTransition] Captured', targetSnapshots.length, 'visible targets');

    setTransitionState(prev => ({
      ...prev,
      targetSnapshots,
    }));
  }, [captureSnapshot]);

  const completeTransition = useCallback(() => {
    setTransitionState({
      isTransitioning: false,
      fromWorkbench: null,
      toWorkbench: null,
      sourceSnapshots: [],
      targetSnapshots: [],
    });

    // Clear registrations
    sourceElementsRef.current.clear();
    targetElementsRef.current.clear();
  }, []);

  const getMorphPairs = useCallback(() => {
    const pairs: Array<{ source: ElementSnapshot; target: ElementSnapshot }> = [];

    // Group snapshots by fileId for split/merge animations
    const sourcesByFile = new Map<string, ElementSnapshot[]>();
    const targetsByFile = new Map<string, ElementSnapshot[]>();

    // Group sources by fileId
    transitionState.sourceSnapshots.forEach(source => {
      const fileId = source.metadata?.fileId;
      if (fileId) {
        if (!sourcesByFile.has(fileId)) {
          sourcesByFile.set(fileId, []);
        }
        sourcesByFile.get(fileId)!.push(source);
      }
    });

    // Group targets by fileId
    transitionState.targetSnapshots.forEach(target => {
      const fileId = target.metadata?.fileId;
      if (fileId) {
        if (!targetsByFile.has(fileId)) {
          targetsByFile.set(fileId, []);
        }
        targetsByFile.get(fileId)!.push(target);
      }
    });

    // Create morph pairs for each file group
    const allFileIds = new Set([...sourcesByFile.keys(), ...targetsByFile.keys()]);

    allFileIds.forEach(fileId => {
      const sources = sourcesByFile.get(fileId) || [];
      const targets = targetsByFile.get(fileId) || [];

      if (sources.length === 0 || targets.length === 0) return;

      // Sort targets by page number for consistent animation
      targets.sort((a, b) => (a.metadata?.pageNumber || 0) - (b.metadata?.pageNumber || 0));

      if (sources.length === 1 && targets.length > 1) {
        // SPLIT: 1 file card → N page thumbnails
        // All targets morph from the same source (file card)
        const source = sources[0];
        targets.forEach(target => {
          pairs.push({ source, target });
        });
      } else if (sources.length > 1 && targets.length === 1) {
        // MERGE: N page thumbnails → 1 file card
        // All sources morph to the same target (file card)
        const target = targets[0];
        sources.forEach(source => {
          pairs.push({ source, target });
        });
      } else if (sources.length === targets.length) {
        // 1:1 mapping (e.g., page editor to page editor, or same view)
        sources.sort((a, b) => (a.metadata?.pageNumber || 0) - (b.metadata?.pageNumber || 0));
        sources.forEach((source, i) => {
          pairs.push({ source, target: targets[i] });
        });
      }
    });

    return pairs;
  }, [transitionState.sourceSnapshots, transitionState.targetSnapshots]);

  const value: WorkbenchTransitionContextValue = {
    transitionState,
    registerSourceElement,
    registerTargetElement,
    startTransition,
    completeTransition,
    getMorphPairs,
  };

  return (
    <WorkbenchTransitionContext.Provider value={value}>
      {children}
    </WorkbenchTransitionContext.Provider>
  );
}
