import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';
import { SpreadMode } from '@embedpdf/plugin-spread/react';
import { useNavigation } from '@app/contexts/NavigationContext';

// Bridge API interfaces - these match what the bridges provide
interface ScrollAPIWrapper {
  scrollToPage: (params: { pageNumber: number }) => void;
  scrollToPreviousPage: () => void;
  scrollToNextPage: () => void;
}

interface ZoomAPIWrapper {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleMarqueeZoom: () => void;
  requestZoom: (level: number) => void;
}

interface PanAPIWrapper {
  enable: () => void;
  disable: () => void;
  toggle: () => void;
}

interface SelectionAPIWrapper {
  copyToClipboard: () => void;
  getSelectedText: () => string | any;
  getFormattedSelection: () => any;
}

interface SpreadAPIWrapper {
  setSpreadMode: (mode: SpreadMode) => void;
  getSpreadMode: () => SpreadMode | null;
  toggleSpreadMode: () => void;
}

interface RotationAPIWrapper {
  rotateForward: () => void;
  rotateBackward: () => void;
  setRotation: (rotation: number) => void;
  getRotation: () => number;
}

interface SearchAPIWrapper {
  search: (query: string) => Promise<any>;
  clear: () => void;
  next: () => void;
  previous: () => void;
}

interface ThumbnailAPIWrapper {
  renderThumb: (pageIndex: number, scale: number) => { toPromise: () => Promise<Blob> };
}

interface ExportAPIWrapper {
  download: () => void;
  saveAsCopy: () => { toPromise: () => Promise<ArrayBuffer> };
}

// Redaction bridge wrappers
interface RedactionAPIWrapper {
  toggleRedactSelection: () => void;
  toggleMarqueeRedact: () => void;
  clearPending: () => void;
  commitAllPending: () => { toPromise: () => Promise<void> } | Promise<void> | void;
}

interface RedactionState {
  isRedacting: boolean;
  activeType: 'redactSelection' | 'marqueeRedact' | null;
  pendingCount: number;
}

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

interface SearchResult {
  pageIndex: number;
  rects: Array<{
    origin: { x: number; y: number };
    size: { width: number; height: number };
  }>;
}

interface SearchState {
  results: SearchResult[] | null;
  activeIndex: number;
}

interface ExportState {
  canExport: boolean;
}

type ToolMode = 'none' | 'pan' | 'redact' | 'draw';

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

  // Annotation visibility toggle
  isAnnotationsVisible: boolean;
  toggleAnnotationsVisibility: () => void;

  // Annotation/drawing mode for viewer
  isAnnotationMode: boolean;
  setAnnotationMode: (enabled: boolean) => void;
  toggleAnnotationMode: () => void;

  // Active file index for multi-file viewing
  activeFileIndex: number;
  setActiveFileIndex: (index: number) => void;

  // State getters - read current state from bridges
  getScrollState: () => ScrollState;
  getZoomState: () => ZoomState;
  getPanState: () => PanState;
  getSelectionState: () => SelectionState;
  getSpreadState: () => SpreadState;
  getRotationState: () => RotationState;
  getSearchState: () => SearchState;
  getThumbnailAPI: () => ThumbnailAPIWrapper | null;
  getExportState: () => ExportState;
  getToolMode: () => ToolMode;
  getRedactionState: () => RedactionState;

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
    getSpreadMode: () => SpreadMode | null;
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

  exportActions: {
    download: () => void;
    saveAsCopy: () => Promise<ArrayBuffer | null>;
  };

  redactionActions: {
    activateText: () => void;
    activateArea: () => void;
    deactivate: () => void;
    commitAllPending: () => Promise<void>;
    clearPending: () => void;
    isActive: () => boolean;
  };

  // Live updates for right-rail highlighting
  registerToolModeListener: (callback: (mode: ToolMode) => void) => void;
  unregisterToolModeListener: () => void;
  triggerToolModeUpdate: () => void;

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
  const [isAnnotationsVisible, setIsAnnotationsVisible] = useState(true);
  const [isAnnotationMode, setIsAnnotationModeState] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Get current navigation state to check if we're in sign mode
  useNavigation();

  // Bridge registry - bridges register their state and APIs here
  const bridgeRefs = useRef({
    scroll: null as BridgeRef<ScrollState, ScrollAPIWrapper> | null,
    zoom: null as BridgeRef<ZoomState, ZoomAPIWrapper> | null,
    pan: null as BridgeRef<PanState, PanAPIWrapper> | null,
    selection: null as BridgeRef<SelectionState, SelectionAPIWrapper> | null,
    search: null as BridgeRef<SearchState, SearchAPIWrapper> | null,
    spread: null as BridgeRef<SpreadState, SpreadAPIWrapper> | null,
    rotation: null as BridgeRef<RotationState, RotationAPIWrapper> | null,
    thumbnail: null as BridgeRef<unknown, ThumbnailAPIWrapper> | null,
    export: null as BridgeRef<ExportState, ExportAPIWrapper> | null,
    redaction: null as BridgeRef<RedactionState, RedactionAPIWrapper> | null,
  });

  const toolModeListenerRef = useRef<((mode: ToolMode) => void) | null>(null);

  // Immediate zoom callback for responsive display updates
  const immediateZoomUpdateCallback = useRef<((percent: number) => void) | null>(null);

  // Immediate scroll callback for responsive display updates
  const immediateScrollUpdateCallback = useRef<((currentPage: number, totalPages: number) => void) | null>(null);

  const registerBridge = (type: string, ref: BridgeRef) => {
    // Type-safe assignment - we know the bridges will provide correct types
    switch (type) {
      case 'scroll':
        bridgeRefs.current.scroll = ref as BridgeRef<ScrollState, ScrollAPIWrapper>;
        break;
      case 'zoom':
        bridgeRefs.current.zoom = ref as BridgeRef<ZoomState, ZoomAPIWrapper>;
        break;
      case 'pan':
        bridgeRefs.current.pan = ref as BridgeRef<PanState, PanAPIWrapper>;
        break;
      case 'selection':
        bridgeRefs.current.selection = ref as BridgeRef<SelectionState, SelectionAPIWrapper>;
        break;
      case 'search':
        bridgeRefs.current.search = ref as BridgeRef<SearchState, SearchAPIWrapper>;
        break;
      case 'spread':
        bridgeRefs.current.spread = ref as BridgeRef<SpreadState, SpreadAPIWrapper>;
        break;
      case 'rotation':
        bridgeRefs.current.rotation = ref as BridgeRef<RotationState, RotationAPIWrapper>;
        break;
      case 'thumbnail':
        bridgeRefs.current.thumbnail = ref as BridgeRef<unknown, ThumbnailAPIWrapper>;
        break;
      case 'export':
        bridgeRefs.current.export = ref as BridgeRef<ExportState, ExportAPIWrapper>;
        break;
      case 'redaction':
        bridgeRefs.current.redaction = ref as BridgeRef<RedactionState, RedactionAPIWrapper>;
        break;
    }
  };

  const toggleThumbnailSidebar = () => {
    setIsThumbnailSidebarVisible(prev => !prev);
  };

  const toggleAnnotationsVisibility = () => {
    setIsAnnotationsVisible(prev => !prev);
  };

  const setAnnotationMode = (enabled: boolean) => {
    setIsAnnotationModeState(enabled);
    // Notify listeners when draw mode changes
    triggerToolModeUpdate();
  };

  const toggleAnnotationMode = () => {
    setIsAnnotationModeState(prev => !prev);
    // Notify listeners when draw mode changes
    setTimeout(() => triggerToolModeUpdate(), 0);
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

  const getExportState = (): ExportState => {
    return bridgeRefs.current.export?.state || { canExport: false };
  };

  const getToolMode = (): ToolMode => {
    if (isAnnotationMode) return 'draw';
    const redactionActive = bridgeRefs.current.redaction?.state?.isRedacting;
    if (redactionActive) return 'redact';
    const panActive = bridgeRefs.current.pan?.state?.isPanning;
    if (panActive) return 'pan';
    return 'none';
  };

  const getRedactionState = (): RedactionState => {
    return (
      bridgeRefs.current.redaction?.state || {
        isRedacting: false,
        activeType: null,
        pendingCount: 0,
      }
    );
  };

  // Action handlers - call APIs directly
  const scrollActions = {
    scrollToPage: (page: number) => {
      const api = bridgeRefs.current.scroll?.api;
      if (api?.scrollToPage) {
        api.scrollToPage({ pageNumber: page });
      }
    },
    scrollToFirstPage: () => {
      const api = bridgeRefs.current.scroll?.api;
      if (api?.scrollToPage) {
        api.scrollToPage({ pageNumber: 1 });
      }
    },
    scrollToPreviousPage: () => {
      const api = bridgeRefs.current.scroll?.api;
      if (api?.scrollToPreviousPage) {
        api.scrollToPreviousPage();
      }
    },
    scrollToNextPage: () => {
      const api = bridgeRefs.current.scroll?.api;
      if (api?.scrollToNextPage) {
        api.scrollToNextPage();
      }
    },
    scrollToLastPage: () => {
      const scrollState = getScrollState();
      const api = bridgeRefs.current.scroll?.api;
      if (api?.scrollToPage && scrollState.totalPages > 0) {
        api.scrollToPage({ pageNumber: scrollState.totalPages });
      }
    }
  };

  const zoomActions = {
    zoomIn: () => {
      const api = bridgeRefs.current.zoom?.api;
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
      const api = bridgeRefs.current.zoom?.api;
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
      const api = bridgeRefs.current.zoom?.api;
      if (api?.toggleMarqueeZoom) {
        api.toggleMarqueeZoom();
      }
    },
    requestZoom: (level: number) => {
      const api = bridgeRefs.current.zoom?.api;
      if (api?.requestZoom) {
        api.requestZoom(level);
      }
    }
  };

  const panActions = {
    enablePan: () => {
      const api = bridgeRefs.current.pan?.api;
      if (api?.enable) {
        api.enable();
      }
    },
    disablePan: () => {
      const api = bridgeRefs.current.pan?.api;
      if (api?.disable) {
        api.disable();
      }
    },
    togglePan: () => {
      const api = bridgeRefs.current.pan?.api;
      if (api?.toggle) {
        api.toggle();
      }
    }
  };

  const selectionActions = {
    copyToClipboard: () => {
      const api = bridgeRefs.current.selection?.api;
      if (api?.copyToClipboard) {
        api.copyToClipboard();
      }
    },
    getSelectedText: () => {
      const api = bridgeRefs.current.selection?.api;
      if (api?.getSelectedText) {
        return api.getSelectedText();
      }
      return '';
    },
    getFormattedSelection: () => {
      const api = bridgeRefs.current.selection?.api;
      if (api?.getFormattedSelection) {
        return api.getFormattedSelection();
      }
      return null;
    }
  };

  const spreadActions = {
    setSpreadMode: (mode: SpreadMode) => {
      const api = bridgeRefs.current.spread?.api;
      if (api?.setSpreadMode) {
        api.setSpreadMode(mode);
      }
    },
    getSpreadMode: () => {
      const api = bridgeRefs.current.spread?.api;
      if (api?.getSpreadMode) {
        return api.getSpreadMode();
      }
      return null;
    },
    toggleSpreadMode: () => {
      const api = bridgeRefs.current.spread?.api;
      if (api?.toggleSpreadMode) {
        api.toggleSpreadMode();
      }
    }
  };

  const rotationActions = {
    rotateForward: () => {
      const api = bridgeRefs.current.rotation?.api;
      if (api?.rotateForward) {
        api.rotateForward();
      }
    },
    rotateBackward: () => {
      const api = bridgeRefs.current.rotation?.api;
      if (api?.rotateBackward) {
        api.rotateBackward();
      }
    },
    setRotation: (rotation: number) => {
      const api = bridgeRefs.current.rotation?.api;
      if (api?.setRotation) {
        api.setRotation(rotation);
      }
    },
    getRotation: () => {
      const api = bridgeRefs.current.rotation?.api;
      if (api?.getRotation) {
        return api.getRotation();
      }
      return 0;
    }
  };

  const searchActions = {
    search: async (query: string) => {
      const api = bridgeRefs.current.search?.api;
      if (api?.search) {
        return api.search(query);
      }
    },
    next: () => {
      const api = bridgeRefs.current.search?.api;
      if (api?.next) {
        api.next();
      }
    },
    previous: () => {
      const api = bridgeRefs.current.search?.api;
      if (api?.previous) {
        api.previous();
      }
    },
    clear: () => {
      const api = bridgeRefs.current.search?.api;
      if (api?.clear) {
        api.clear();
      }
    }
  };

  const exportActions = {
    download: () => {
      const api = bridgeRefs.current.export?.api;
      if (api?.download) {
        api.download();
      }
    },
    saveAsCopy: async () => {
      const api = bridgeRefs.current.export?.api;
      if (api?.saveAsCopy) {
        try {
          const result = api.saveAsCopy();
          return await result.toPromise();
        } catch (error) {
          console.error('Failed to save PDF copy:', error);
          return null;
        }
      }
      return null;
    }
  };

  // Track redaction dirty state (any commit or pending marks)
  const redactionActions = {
    activateText: () => {
      const api = bridgeRefs.current.redaction?.api;
      const state = bridgeRefs.current.redaction?.state;
      if (!api) return;
      if (state?.activeType === 'redactSelection') return; // already active
      // If other mode active, turn it off first
      if (state?.activeType === 'marqueeRedact' && api.toggleMarqueeRedact) api.toggleMarqueeRedact();
      if (api.toggleRedactSelection) api.toggleRedactSelection();
    },
    activateArea: () => {
      const api = bridgeRefs.current.redaction?.api;
      const state = bridgeRefs.current.redaction?.state;
      if (!api) return;
      if (state?.activeType === 'marqueeRedact') return; // already active
      if (state?.activeType === 'redactSelection' && api.toggleRedactSelection) api.toggleRedactSelection();
      if (api.toggleMarqueeRedact) api.toggleMarqueeRedact();
    },
    deactivate: () => {
      const state = bridgeRefs.current.redaction?.state;
      const api = bridgeRefs.current.redaction?.api;
      if (!state || !api) return;
      // If text is active, toggling text will deactivate; same for area
      if (state.activeType === 'redactSelection' && api.toggleRedactSelection) {
        api.toggleRedactSelection();
      } else if (state.activeType === 'marqueeRedact' && api.toggleMarqueeRedact) {
        api.toggleMarqueeRedact();
      }
    },
    commitAllPending: async () => {
      const api = bridgeRefs.current.redaction?.api;
      if (!api?.commitAllPending) return;
      const result = api.commitAllPending();
      if (result && typeof (result as any).toPromise === 'function') {
        await (result as any).toPromise();
      }
    },
    clearPending: () => {
      const api = bridgeRefs.current.redaction?.api;
      if (api?.clearPending) api.clearPending();
    },
    isActive: () => {
      return Boolean(bridgeRefs.current.redaction?.state?.isRedacting);
    },
  };

  const registerToolModeListener = (callback: (mode: ToolMode) => void) => {
    toolModeListenerRef.current = callback;
  };

  const unregisterToolModeListener = () => {
    toolModeListenerRef.current = null;
  };

  const triggerToolModeUpdate = () => {
    const cb = toolModeListenerRef.current;
    if (cb) cb(getToolMode());
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

    // Annotation controls
    isAnnotationsVisible,
    toggleAnnotationsVisibility,
    isAnnotationMode,
    setAnnotationMode,
    toggleAnnotationMode,

    // Active file index
    activeFileIndex,
    setActiveFileIndex,

    // State getters
    getScrollState,
    getZoomState,
    getPanState,
    getSelectionState,
    getSpreadState,
    getRotationState,
    getSearchState,
    getThumbnailAPI,
    getExportState,
    getToolMode,
    getRedactionState,

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
    exportActions,
    redactionActions,
    registerToolModeListener,
    unregisterToolModeListener,
    triggerToolModeUpdate,

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
