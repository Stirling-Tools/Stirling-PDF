import { useEffect, useRef, useMemo } from 'react';
import { useWorkbenchTransition } from '@app/contexts/WorkbenchTransitionContext';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { isBaseWorkbench } from '@app/types/workbench';

/**
 * Hook to register an element for morphing animations during workbench transitions
 *
 * @param morphId - Unique identifier for this element (should be consistent across views)
 * @param metadata - Optional metadata (file ID, page number, etc.)
 * @param options - Configuration options
 * @returns Ref to attach to the element that should morph
 *
 * @example
 * ```tsx
 * // In FileEditor
 * const ref = useMorphElement(`file-${fileId}`, { fileId, type: 'file' });
 * return <div ref={ref}>File Card</div>;
 *
 * // In PageEditor (same fileId)
 * const ref = useMorphElement(`file-${fileId}`, { fileId, type: 'page' });
 * return <div ref={ref}>Page Thumbnail</div>;
 * ```
 */
export function useMorphElement<T extends HTMLElement = HTMLDivElement>(
  morphId: string,
  metadata?: Record<string, any>,
  options?: {
    /**
     * Only register in specific workbench types
     */
    onlyIn?: ('viewer' | 'pageEditor' | 'fileEditor')[];

    /**
     * Disable morphing for this element
     */
    disabled?: boolean;
  }
) {
  const elementRef = useRef<T>(null);
  const { registerSourceElement, registerTargetElement, transitionState } = useWorkbenchTransition();
  const { workbench } = useNavigationState();

  const currentWorkbench = isBaseWorkbench(workbench) ? workbench : null;

  // Stabilize metadata object to prevent unnecessary re-registrations
  const stableMetadata = useMemo(() => metadata, [JSON.stringify(metadata)]);

  useEffect(() => {
    if (!elementRef.current || !currentWorkbench || options?.disabled) return;

    // Check if we should register in this workbench
    if (options?.onlyIn && !options.onlyIn.includes(currentWorkbench)) {
      return;
    }

    const element = elementRef.current;

    // ALWAYS register as source when mounted in current workbench
    // This ensures elements are available as sources before transition starts
    registerSourceElement(morphId, element, stableMetadata);

    // Cleanup is handled by the context when transition completes
  }, [
    morphId,
    currentWorkbench,
    registerSourceElement,
    stableMetadata,
    options?.disabled,
    options?.onlyIn,
  ]);

  // Separate effect for target registration during transitions
  useEffect(() => {
    if (!elementRef.current || !currentWorkbench || options?.disabled) return;

    // Check if we should register in this workbench
    if (options?.onlyIn && !options.onlyIn.includes(currentWorkbench)) {
      return;
    }

    // Only register as target if we're transitioning TO this workbench
    if (transitionState.isTransitioning && transitionState.toWorkbench === currentWorkbench) {
      const element = elementRef.current;
      registerTargetElement(morphId, element, stableMetadata);
    }
  }, [
    morphId,
    currentWorkbench,
    transitionState.isTransitioning,
    transitionState.toWorkbench,
    registerTargetElement,
    stableMetadata,
    options?.disabled,
    options?.onlyIn,
  ]);

  return elementRef;
}
