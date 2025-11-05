import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SelectionMenuProps, useRedaction } from '@embedpdf/plugin-redaction/react';

/**
 * Small inline menu rendered by RedactionLayer when a pending mark is selected.
 * Shows Accept (commit) and Remove controls.
 * Uses a portal to render at document body level to ensure it's always above PDF pages.
 */
export default function RedactionSelectionMenu({ item, selected, menuWrapperProps }: SelectionMenuProps) {
  const { provides, state } = useRedaction();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Track the current mode before committing to ensure it's preserved
  const modeBeforeCommitRef = useRef<'redactSelection' | 'marqueeRedact' | null>(null);
  
  // Store current mode when menu is shown
  useEffect(() => {
    if (selected && state.activeType) {
      modeBeforeCommitRef.current = state.activeType as 'redactSelection' | 'marqueeRedact' | null;
    }
  }, [selected, state.activeType]);

  // Extract ref from menuWrapperProps - must happen before any conditional returns
  const { ref: wrapperPropsRef, ...restWrapperProps } = menuWrapperProps || {};
  
  // Merge refs - must be called unconditionally
  const mergedRef = React.useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    if (typeof wrapperPropsRef === 'function') {
      wrapperPropsRef(node);
    } else if (wrapperPropsRef) {
      (wrapperPropsRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [wrapperPropsRef]);

  // Get overlay - must be called unconditionally
  const overlay = typeof document !== 'undefined' ? document.getElementById('pdf-overlay-root') : null;

  // All hooks must be called before any conditional returns
  useEffect(() => {
    if (!selected) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      // Get the overlay root
      const overlayEl = document.getElementById('pdf-overlay-root');
      if (!overlayEl || !wrapperRef.current) {
        setPosition(null);
        return;
      }

      // Get the wrapper's bounding rect in viewport coordinates
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const overlayRect = overlayEl.getBoundingClientRect();
      
      // Calculate position relative to overlay
      const menuHeight = item?.rect?.size?.height || 0;
      const top = wrapperRect.top - overlayRect.top + menuHeight + 10;
      const left = wrapperRect.left - overlayRect.left;

      setPosition({ top, left });
    };

    // Initial position calculation
    updatePosition();

    // Update on scroll, resize, and zoom changes
    const handleUpdate = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    
    // Use a mutation observer to catch DOM changes that might affect position
    const observer = new MutationObserver(handleUpdate);
    if (wrapperRef.current) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Also use intersection observer as fallback
    const intersectionObserver = new IntersectionObserver(
      () => handleUpdate(),
      { threshold: 0, root: null }
    );
    if (wrapperRef.current) {
      intersectionObserver.observe(wrapperRef.current);
    }

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      observer.disconnect();
      intersectionObserver.disconnect();
    };
  }, [selected, item?.rect?.size?.height]);

  // Now we can conditionally render - but all hooks have been called
  if (!selected) {
    return (
      <div
        ref={mergedRef}
        {...restWrapperProps}
        style={{
          ...restWrapperProps?.style,
          position: 'relative',
          pointerEvents: 'none',
          display: 'none'
        }}
      />
    );
  }

  const menuContent = (
    <div
      style={{
        position: 'absolute',
        top: position ? `${position.top}px` : 0,
        left: position ? `${position.left}px` : 0,
        pointerEvents: 'auto',
        display: 'flex',
        gap: 12,
        background: 'rgba(255,255,255,0.98)',
        border: '1px solid rgba(15, 23, 42, 0.08)',
        borderRadius: 12,
        padding: '8px 10px',
        boxShadow: '0 6px 14px rgba(0,0,0,0.12)',
        zIndex: 2147483647
      }}
    >
      <button
        onClick={async () => {
          // Store the current mode before committing to ensure it's preserved
          const currentMode = state.activeType as 'redactSelection' | 'marqueeRedact' | null;
          if (currentMode) {
            modeBeforeCommitRef.current = currentMode;
            // Update session storage so bridge can restore it
            sessionStorage.setItem('redaction:lastManualType', currentMode);
          }
          
          // Commit the redaction
          // The RedactionAPIBridge will handle mode restoration after commit
          if (provides?.commitPending) {
            await provides.commitPending(item.page, item.id);
          }
        }}
        style={{
          padding: '10px 18px',
          borderRadius: 12,
          border: '1px solid #ef4444',
          background: '#ef4444',
          color: 'white',
          fontWeight: 600,
          fontSize: 16,
          lineHeight: 1.0,
          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
          cursor: 'pointer'
        }}
      >
        Apply
      </button>
      <button
        onClick={() => provides?.removePending?.(item.page, item.id)}
        style={{
          padding: '10px 18px',
          borderRadius: 12,
          border: '1px solid rgba(15, 23, 42, 0.12)',
          background: 'rgba(241, 245, 249, 0.8)',
          color: '#334155',
          fontWeight: 600,
          fontSize: 16,
          lineHeight: 1.0,
          cursor: 'pointer'
        }}
      >
        Remove
      </button>
    </div>
  );

  return (
    <>
      <div
        ref={mergedRef}
        {...restWrapperProps}
        style={{
          ...restWrapperProps?.style,
          position: 'relative',
          pointerEvents: 'none'
        }}
      />
      {overlay && position && createPortal(menuContent, overlay)}
    </>
  );
}


