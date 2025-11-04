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

interface RedactionAPIWrapper {
  // Common redaction API surface (union of likely method names)
  toggleMarqueeRedact?: () => void;
  toggleRedactSelection?: () => void;
  activateAreaRedaction?: (mode?: any) => void;
  activateTextRedaction?: (mode?: any) => void;
  startAreaRedaction?: (mode?: any) => void;
  startTextRedaction?: (mode?: any) => void;
  enableAreaRedaction?: (mode?: any) => void;
  enableTextRedaction?: (mode?: any) => void;
  setRedactionMode?: (mode: any) => void;
  setMode?: (mode: any) => void;
  applyRedactions?: () => any;
  applyPendingRedactions?: () => any;
  apply?: () => any;
  commit?: () => any;
  finalizeRedactions?: () => any;
  performRedactions?: () => any;
  exportRedactedDocument?: (opts?: any) => any;
  getRedactedDocument?: () => any;
  getBlob?: () => any;
  onStateChange?: (cb: (state: any) => void) => void;
  offStateChange?: (cb: (state: any) => void) => void;
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

interface RedactionState {
  activeType: string | null;
  hasPending: boolean;
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

  // Redaction
  getRedactionState: () => RedactionState;
  getRedactionDesiredMode: () => 'area' | 'text' | null;
  redactionActions: {
    activateArea: () => void;
    activateText: () => void;
    clearMode: () => void;
    applyRedactions: () => Promise<boolean>;
    exportRedactedBlob: () => Promise<Blob | null>;
  };
  // Immediate redaction mode update subscription (for left panel UI)
  registerImmediateRedactionModeUpdate: (callback: (mode: 'area' | 'text' | null) => void) => void;
  triggerImmediateRedactionModeUpdate: (mode: 'area' | 'text' | null) => void;

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

  // Desired redaction mode persists across state changes to keep tool active after inline apply
  const desiredRedactionModeRef = useRef<'area' | 'text' | null>(null);
  const immediateRedactionModeCallbacksRef = useRef<Set<(mode: 'area' | 'text' | null) => void>>(new Set());

  const notifyImmediateRedactionMode = (mode: 'area' | 'text' | null) => {
    try {
      immediateRedactionModeCallbacksRef.current.forEach(cb => {
        try { cb(mode); } catch {}
      });
    } catch {}
  };

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
  };

  const toggleAnnotationMode = () => {
    setIsAnnotationModeState(prev => !prev);
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

  const getRedactionState = (): RedactionState => {
    return bridgeRefs.current.redaction?.state || { activeType: null, hasPending: false };
  };

  const getRedactionDesiredMode = () => desiredRedactionModeRef.current;

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

  // Helpers to robustly call redaction API methods across versions
  const callFirst = (api: any, names: string[], args: any[] = []) => {
    for (const name of names) {
      const fn = api?.[name];
      if (typeof fn === 'function') {
        try { return fn.apply(api, args); } catch { /* noop */ }
      }
    }
    return undefined;
  };

  const redactionActions = {
    activateArea: () => {
      const api = bridgeRefs.current.redaction?.api as any;
      if (!api) return;
      desiredRedactionModeRef.current = 'area';
      notifyImmediateRedactionMode('area');
      // Exclusivity: turn off draw and pan when redaction is active
      try { setIsAnnotationModeState(false); } catch {}
      try { (bridgeRefs.current.pan?.api as any)?.disable?.(); } catch {}
      // Ensure selection isn't intercepting text drags
      try { (bridgeRefs.current.selection?.api as any)?.setMode?.('none'); } catch {}
      // Prefer non-toggle methods first to avoid accidentally clearing mode
      const areaModes = ['area', 'box', 'rectangle', 'shape'];
      for (const mode of areaModes) {
        if (callFirst(api, ['activateAreaRedaction','startAreaRedaction','enableAreaRedaction','activateMode'], [mode])) return;
        if (callFirst(api, ['setRedactionMode','setMode'], [mode])) return;
        if (callFirst(api, ['setRedactionMode','setMode'], [{ mode }])) return;
        if (callFirst(api, ['setMode'], [{ type: mode }])) return;
        if (callFirst(api, ['setMode'], [mode.toUpperCase?.() ?? mode])) return;
      }
      // Fallback to toggle only if non-toggle methods don't work
      if (api.toggleMarqueeRedact) { try { api.toggleMarqueeRedact(); return; } catch {} }
    },
    activateText: () => {
      const api = bridgeRefs.current.redaction?.api as any;
      if (!api) return;
      desiredRedactionModeRef.current = 'text';
      notifyImmediateRedactionMode('text');
      // Exclusivity: turn off draw and pan when redaction is active
      try { setIsAnnotationModeState(false); } catch {}
      try { (bridgeRefs.current.pan?.api as any)?.disable?.(); } catch {}
      // Ensure selection plugin is in text mode
      try { (bridgeRefs.current.selection?.api as any)?.setMode?.('text'); } catch {}
      // Prefer non-toggle methods first to avoid accidentally clearing mode
      const textModes = ['text','search','pattern'];
      for (const mode of textModes) {
        if (callFirst(api, ['activateTextRedaction','startTextRedaction','enableTextRedaction','activateMode'], [mode])) return;
        if (callFirst(api, ['setRedactionMode','setMode'], [mode])) return;
        if (callFirst(api, ['setRedactionMode','setMode'], [{ mode }])) return;
        if (callFirst(api, ['setMode'], [{ type: mode }])) return;
        if (callFirst(api, ['setMode'], [mode.toUpperCase?.() ?? mode])) return;
      }
      // Fallback to toggle only if non-toggle methods don't work
      if (api.toggleRedactSelection) { try { api.toggleRedactSelection(); return; } catch {} }
    },
    clearMode: () => {
      const api = bridgeRefs.current.redaction?.api as any;
      if (!api) return;
      desiredRedactionModeRef.current = null;
      notifyImmediateRedactionMode(null);
      // Best effort: set selection mode to none or deactivate redaction
      try { (bridgeRefs.current.selection?.api as any)?.setMode?.('none'); } catch {}
      try { api.setMode?.('none'); } catch {}
    },
    applyRedactions: async () => {
      const api = bridgeRefs.current.redaction?.api as any;
      if (!api) return false;
      const names = ['applyRedactions','applyPendingRedactions','apply','commit','finalizeRedactions','performRedactions'];
      for (const name of names) {
        const fn = api?.[name];
        if (typeof fn === 'function') {
          try { const r = fn.call(api); if (r?.then) await r; return true; } catch { /* try next */ }
        }
      }
      return false;
    },
    exportRedactedBlob: async () => {
      const api = bridgeRefs.current.redaction?.api as any;
      const exportApi = bridgeRefs.current.export?.api as any;
      const toBlob = async (value: any): Promise<Blob | null> => {
        if (!value) return null;
        if (value instanceof Blob) return value;
        if (value instanceof ArrayBuffer) return new Blob([value], { type: 'application/pdf' });
        if (value instanceof Uint8Array) {
          const copy = new Uint8Array(value.byteLength);
          copy.set(value);
          return new Blob([copy.buffer], { type: 'application/pdf' });
        }
        if (value.data instanceof ArrayBuffer) return new Blob([value.data], { type: 'application/pdf' });
        if (value.blob instanceof Blob) return value.blob;
        if (typeof value.toBlob === 'function') return value.toBlob();
        if (typeof value.toPromise === 'function') {
          const res = await value.toPromise();
          if (res instanceof ArrayBuffer) return new Blob([res], { type: 'application/pdf' });
        }
        if (typeof value.arrayBuffer === 'function') {
          const buf = await value.arrayBuffer();
          return new Blob([buf], { type: 'application/pdf' });
        }
        return null;
      };

      const attempts: Array<[any, string, any[]]> = [
        [api, 'exportRedactedDocument', [{ type: 'blob' }]],
        [api, 'exportRedactedDocument', []],
        [api, 'getRedactedDocument', []],
        [api, 'getBlob', []],
        [exportApi, 'exportDocument', [{ type: 'blob' }]],
        [exportApi, 'exportDocument', []],
      ];
      for (const [target, method, args] of attempts) {
        const fn = target?.[method];
        if (typeof fn === 'function') {
          try {
            const r = fn.apply(target, args);
            const blob = await toBlob(r);
            if (blob) return blob;
          } catch { /* try next */ }
        }
      }
      // Fallback
      try {
        const handle = exportApi?.saveAsCopy?.();
        const blob = await toBlob(handle);
        if (blob) return blob;
      } catch {}
      return null;
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

    // Redaction
    getRedactionState,
    getRedactionDesiredMode,
    redactionActions,
    registerImmediateRedactionModeUpdate: (callback) => { immediateRedactionModeCallbacksRef.current.add(callback); },
    triggerImmediateRedactionModeUpdate: (mode) => { notifyImmediateRedactionMode(mode); },

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
