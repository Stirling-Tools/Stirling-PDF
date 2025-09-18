import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';
import { SpreadMode } from '@embedpdf/plugin-spread/react';

// State interfaces - represent the shape of data from each bridge
interface ScrollState {
  currentPage: number;
  totalPages: number;
}

interface ZoomState {
  currentZoom: number;
  zoomPercent: number;
}

interface PanState {
  isPanning: boolean;
}

interface SelectionState {
  hasSelection: boolean;
}

interface SpreadState {
  spreadMode: SpreadMode;
  isDualPage: boolean;
}

interface RotationState {
  rotation: number;
}

interface SearchState {
  results: any[] | null;
  activeIndex: number;
}

// Bridge registration interface - bridges register with state and API
interface BridgeRef<TState = unknown, TApi = unknown> {
  state: TState;
  api: TApi;
}

/**
 * ViewerContext provides a unified interface to EmbedPDF functionality.
 * 
 * Architecture:
 * - Bridges store their own state locally and register with this context
 * - Context provides read-only access to bridge state via getter functions
 * - Actions call EmbedPDF APIs directly through bridge references
 * - No circular dependencies - bridges don't call back into this context
 */
interface ViewerContextType {
  // UI state managed by this context
  isThumbnailSidebarVisible: boolean;
  toggleThumbnailSidebar: () => void;
  
  // State getters - read current state from bridges
  getScrollState: () => ScrollState;
  getZoomState: () => ZoomState;
  getPanState: () => PanState;
  getSelectionState: () => SelectionState;
  getSpreadState: () => SpreadState;
  getRotationState: () => RotationState;
  getSearchState: () => SearchState;
  getThumbnailAPI: () => unknown;
  
  // Immediate update callbacks
  registerImmediateZoomUpdate: (callback: (percent: number) => void) => void;
  registerImmediateScrollUpdate: (callback: (currentPage: number, totalPages: number) => void) => void;
  
  // Internal - for bridges to trigger immediate updates
  triggerImmediateScrollUpdate: (currentPage: number, totalPages: number) => void;
  triggerImmediateZoomUpdate: (zoomPercent: number) => void;
  
  // Action handlers - call EmbedPDF APIs directly
  scrollActions: {
    scrollToPage: (page: number) => void;
    scrollToFirstPage: () => void;
    scrollToPreviousPage: () => void;
    scrollToNextPage: () => void;
    scrollToLastPage: () => void;
  };
  
  zoomActions: {
    zoomIn: () => void;
    zoomOut: () => void;
    toggleMarqueeZoom: () => void;
    requestZoom: (level: number) => void;
  };
  
  panActions: {
    enablePan: () => void;
    disablePan: () => void;
    togglePan: () => void;
  };
  
  selectionActions: {
    copyToClipboard: () => void;
    getSelectedText: () => string;
    getFormattedSelection: () => unknown;
  };
  
  spreadActions: {
    setSpreadMode: (mode: SpreadMode) => void;
    getSpreadMode: () => SpreadMode;
    toggleSpreadMode: () => void;
  };
  
  rotationActions: {
    rotateForward: () => void;
    rotateBackward: () => void;
    setRotation: (rotation: number) => void;
    getRotation: () => number;
  };
  
  searchActions: {
    search: (query: string) => Promise<void>;
    next: () => void;
    previous: () => void;
    clear: () => void;
  };

  // Bridge registration - internal use by bridges
  registerBridge: (type: string, ref: BridgeRef) => void;
}

export const ViewerContext = createContext<ViewerContextType | null>(null);

interface ViewerProviderProps {
  children: ReactNode;
}

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children }) => {
  // UI state - only state directly managed by this context
  const [isThumbnailSidebarVisible, setIsThumbnailSidebarVisible] = useState(false);
  
  // Bridge registry - bridges register their state and APIs here
  const bridgeRefs = useRef({
    scroll: null as BridgeRef<ScrollState> | null,
    zoom: null as BridgeRef<ZoomState> | null,
    pan: null as BridgeRef<PanState> | null,
    selection: null as BridgeRef<SelectionState> | null,
    search: null as BridgeRef<SearchState> | null,
    spread: null as BridgeRef<SpreadState> | null,
    rotation: null as BridgeRef<RotationState> | null,
    thumbnail: null as BridgeRef<unknown> | null,
  });

  // Immediate zoom callback for responsive display updates
  const immediateZoomUpdateCallback = useRef<((percent: number) => void) | null>(null);
  
  // Immediate scroll callback for responsive display updates
  const immediateScrollUpdateCallback = useRef<((currentPage: number, totalPages: number) => void) | null>(null);

  const registerBridge = (type: string, ref: BridgeRef) => {
    (bridgeRefs.current as any)[type] = ref;
  };

  const toggleThumbnailSidebar = () => {
    setIsThumbnailSidebarVisible(prev => !prev);
  };

  // State getters - read from bridge refs
  const getScrollState = (): ScrollState => {
    return bridgeRefs.current.scroll?.state || { currentPage: 1, totalPages: 0 };
  };

  const getZoomState = (): ZoomState => {
    return bridgeRefs.current.zoom?.state || { currentZoom: 1.4, zoomPercent: 140 };
  };

  const getPanState = (): PanState => {
    return bridgeRefs.current.pan?.state || { isPanning: false };
  };

  const getSelectionState = (): SelectionState => {
    return bridgeRefs.current.selection?.state || { hasSelection: false };
  };

  const getSpreadState = (): SpreadState => {
    return bridgeRefs.current.spread?.state || { spreadMode: SpreadMode.None, isDualPage: false };
  };

  const getRotationState = (): RotationState => {
    return bridgeRefs.current.rotation?.state || { rotation: 0 };
  };

  const getSearchState = (): SearchState => {
    return bridgeRefs.current.search?.state || { results: null, activeIndex: 0 };
  };

  const getThumbnailAPI = () => {
    return bridgeRefs.current.thumbnail?.api || null;
  };

  // Action handlers - call APIs directly
  const scrollActions = {
    scrollToPage: (page: number) => {
      const api = bridgeRefs.current.scroll?.api as any;
      if (api?.scrollToPage) {
        api.scrollToPage({ pageNumber: page });
      }
    },
    scrollToFirstPage: () => {
      const api = bridgeRefs.current.scroll?.api as any;
      if (api?.scrollToPage) {
        api.scrollToPage({ pageNumber: 1 });
      }
    },
    scrollToPreviousPage: () => {
      const api = bridgeRefs.current.scroll?.api as any;
      if (api?.scrollToPreviousPage) {
        api.scrollToPreviousPage();
      }
    },
    scrollToNextPage: () => {
      const api = bridgeRefs.current.scroll?.api as any;
      if (api?.scrollToNextPage) {
        api.scrollToNextPage();
      }
    },
    scrollToLastPage: () => {
      const scrollState = getScrollState();
      const api = bridgeRefs.current.scroll?.api as any;
      if (api?.scrollToPage && scrollState.totalPages > 0) {
        api.scrollToPage({ pageNumber: scrollState.totalPages });
      }
    }
  };

  const zoomActions = {
    zoomIn: () => {
      const api = bridgeRefs.current.zoom?.api as any;
      if (api?.zoomIn) {
        // Update display immediately if callback is registered
        if (immediateZoomUpdateCallback.current) {
          const currentState = getZoomState();
          const newPercent = Math.min(Math.round(currentState.zoomPercent * 1.2), 300);
          immediateZoomUpdateCallback.current(newPercent);
        }
        api.zoomIn();
      }
    },
    zoomOut: () => {
      const api = bridgeRefs.current.zoom?.api as any;
      if (api?.zoomOut) {
        // Update display immediately if callback is registered
        if (immediateZoomUpdateCallback.current) {
          const currentState = getZoomState();
          const newPercent = Math.max(Math.round(currentState.zoomPercent / 1.2), 20);
          immediateZoomUpdateCallback.current(newPercent);
        }
        api.zoomOut();
      }
    },
    toggleMarqueeZoom: () => {
      const api = bridgeRefs.current.zoom?.api as any;
      if (api?.toggleMarqueeZoom) {
        api.toggleMarqueeZoom();
      }
    },
    requestZoom: (level: number) => {
      const api = bridgeRefs.current.zoom?.api as any;
      if (api?.requestZoom) {
        api.requestZoom(level);
      }
    }
  };

  const panActions = {
    enablePan: () => {
      const api = bridgeRefs.current.pan?.api as any;
      if (api?.enable) {
        api.enable();
      }
    },
    disablePan: () => {
      const api = bridgeRefs.current.pan?.api as any;
      if (api?.disable) {
        api.disable();
      }
    },
    togglePan: () => {
      const api = bridgeRefs.current.pan?.api as any;
      if (api?.toggle) {
        api.toggle();
      }
    }
  };

  const selectionActions = {
    copyToClipboard: () => {
      const api = bridgeRefs.current.selection?.api as any;
      if (api?.copyToClipboard) {
        api.copyToClipboard();
      }
    },
    getSelectedText: () => {
      const api = bridgeRefs.current.selection?.api as any;
      if (api?.getSelectedText) {
        return api.getSelectedText();
      }
      return '';
    },
    getFormattedSelection: () => {
      const api = bridgeRefs.current.selection?.api as any;
      if (api?.getFormattedSelection) {
        return api.getFormattedSelection();
      }
      return null;
    }
  };

  const spreadActions = {
    setSpreadMode: (mode: SpreadMode) => {
      const api = bridgeRefs.current.spread?.api as any;
      if (api?.setSpreadMode) {
        api.setSpreadMode(mode);
      }
    },
    getSpreadMode: () => {
      const api = bridgeRefs.current.spread?.api as any;
      if (api?.getSpreadMode) {
        return api.getSpreadMode();
      }
      return null;
    },
    toggleSpreadMode: () => {
      const api = bridgeRefs.current.spread?.api as any;
      if (api?.toggleSpreadMode) {
        api.toggleSpreadMode();
      }
    }
  };

  const rotationActions = {
    rotateForward: () => {
      const api = bridgeRefs.current.rotation?.api as any;
      if (api?.rotateForward) {
        api.rotateForward();
      }
    },
    rotateBackward: () => {
      const api = bridgeRefs.current.rotation?.api as any;
      if (api?.rotateBackward) {
        api.rotateBackward();
      }
    },
    setRotation: (rotation: number) => {
      const api = bridgeRefs.current.rotation?.api as any;
      if (api?.setRotation) {
        api.setRotation(rotation);
      }
    },
    getRotation: () => {
      const api = bridgeRefs.current.rotation?.api as any;
      if (api?.getRotation) {
        return api.getRotation();
      }
      return 0;
    }
  };

  const searchActions = {
    search: async (query: string) => {
      const api = bridgeRefs.current.search?.api as any;
      if (api?.search) {
        return api.search(query);
      }
    },
    next: () => {
      const api = bridgeRefs.current.search?.api as any;
      if (api?.next) {
        api.next();
      }
    },
    previous: () => {
      const api = bridgeRefs.current.search?.api as any;
      if (api?.previous) {
        api.previous();
      }
    },
    clear: () => {
      const api = bridgeRefs.current.search?.api as any;
      if (api?.clear) {
        api.clear();
      }
    }
  };

  const registerImmediateZoomUpdate = (callback: (percent: number) => void) => {
    immediateZoomUpdateCallback.current = callback;
  };

  const registerImmediateScrollUpdate = (callback: (currentPage: number, totalPages: number) => void) => {
    immediateScrollUpdateCallback.current = callback;
  };

  const triggerImmediateScrollUpdate = (currentPage: number, totalPages: number) => {
    if (immediateScrollUpdateCallback.current) {
      immediateScrollUpdateCallback.current(currentPage, totalPages);
    }
  };

  const triggerImmediateZoomUpdate = (zoomPercent: number) => {
    if (immediateZoomUpdateCallback.current) {
      immediateZoomUpdateCallback.current(zoomPercent);
    }
  };

  const value: ViewerContextType = {
    // UI state
    isThumbnailSidebarVisible,
    toggleThumbnailSidebar,
    
    // State getters
    getScrollState,
    getZoomState,
    getPanState,
    getSelectionState,
    getSpreadState,
    getRotationState,
    getSearchState,
    getThumbnailAPI,
    
    // Immediate updates
    registerImmediateZoomUpdate,
    registerImmediateScrollUpdate,
    triggerImmediateScrollUpdate,
    triggerImmediateZoomUpdate,
    
    // Actions
    scrollActions,
    zoomActions,
    panActions,
    selectionActions,
    spreadActions,
    rotationActions,
    searchActions,
    
    // Bridge registration
    registerBridge,
  };

  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  );
};

export const useViewer = (): ViewerContextType => {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewer must be used within a ViewerProvider');
  }
  return context;
};