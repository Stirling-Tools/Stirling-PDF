import { useState, useCallback } from 'react';

export interface PageEditorState {
  // Selection state
  selectionMode: boolean;
  selectedPageNumbers: number[];
  
  // Animation state  
  movingPage: number | null;
  isAnimating: boolean;
  
  // Split state
  splitPositions: Set<number>;
  
  // Export state
  exportLoading: boolean;
  
  // Actions
  setSelectionMode: (mode: boolean) => void;
  setSelectedPageNumbers: (pages: number[]) => void;
  setMovingPage: (pageNumber: number | null) => void;
  setIsAnimating: (animating: boolean) => void;
  setSplitPositions: (positions: Set<number>) => void;
  setExportLoading: (loading: boolean) => void;
  
  // Helper functions
  togglePage: (pageNumber: number) => void;
  toggleSelectAll: (totalPages: number) => void;
  animateReorder: () => void;
}

/**
 * Hook for managing PageEditor UI state
 * Handles selection, animation, splits, and export states
 */
export function usePageEditorState(): PageEditorState {
  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);
  
  // Animation state
  const [movingPage, setMovingPage] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Split state - position-based split tracking (replaces page-based splitAfter)
  const [splitPositions, setSplitPositions] = useState<Set<number>>(new Set());
  
  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  
  // Helper functions
  const togglePage = useCallback((pageNumber: number) => {
    setSelectedPageNumbers(prev => 
      prev.includes(pageNumber)
        ? prev.filter(n => n !== pageNumber)
        : [...prev, pageNumber]
    );
  }, []);

  const toggleSelectAll = useCallback((totalPages: number) => {
    if (!totalPages) return;
    
    const allPageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
    setSelectedPageNumbers(prev => 
      prev.length === allPageNumbers.length ? [] : allPageNumbers
    );
  }, []);
  
  const animateReorder = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
  }, []);
  
  return {
    // State
    selectionMode,
    selectedPageNumbers,
    movingPage,
    isAnimating,
    splitPositions,
    exportLoading,
    
    // Setters
    setSelectionMode,
    setSelectedPageNumbers,
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