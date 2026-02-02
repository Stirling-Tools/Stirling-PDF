import { useState, useCallback } from 'react';
import React from 'react';

export interface PageEditorState {
  // Selection state
  selectionMode: boolean;
  selectedPageIds: string[];

  // Animation state
  movingPage: number | null;
  isAnimating: boolean;

  // Split state
  splitPositions: Set<number>;

  // Export state
  exportLoading: boolean;

  // Actions
  setSelectionMode: (mode: boolean) => void;
  setSelectedPageIds: (pages: string[]) => void;
  setMovingPage: (pageNumber: number | null) => void;
  setIsAnimating: (animating: boolean) => void;
  setSplitPositions: React.Dispatch<React.SetStateAction<Set<number>>>;
  setExportLoading: (loading: boolean) => void;
  
  // Helper functions
  togglePage: (pageId: string) => void;
  toggleSelectAll: (allPageIds: string[]) => void;
  animateReorder: () => void;
}

/**
 * Hook for managing PageEditor UI state
 * Handles selection, animation, splits, and export states
 */
export function usePageEditorState(): PageEditorState {
  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  
  // Animation state
  const [movingPage, setMovingPage] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Split state - position-based split tracking (replaces page-based splitAfter)
  const [splitPositions, setSplitPositions] = useState<Set<number>>(new Set());
  
  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  
  // Helper functions
  const togglePage = useCallback((pageId: string) => {
    setSelectedPageIds(prev => {
      const newSelection = prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId];
      return newSelection;
    });
  }, []); // Empty deps - uses updater function so always has latest state

  const toggleSelectAll = useCallback((allPageIds: string[]) => {
    if (!allPageIds.length) return;
    
    setSelectedPageIds(prev => 
      prev.length === allPageIds.length ? [] : allPageIds
    );
  }, []);
  
  const animateReorder = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
  }, []);
  
  return {
    // State
    selectionMode,
    selectedPageIds,
    movingPage,
    isAnimating,
    splitPositions,
    exportLoading,
    
    // Setters
    setSelectionMode,
    setSelectedPageIds,
    setMovingPage,
    setIsAnimating,
    setSplitPositions,
    setExportLoading,
    
    // Helpers
    togglePage,
    toggleSelectAll,
    animateReorder,
  };
}