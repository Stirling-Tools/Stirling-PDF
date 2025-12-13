import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useRef,
  useCallback,
} from 'react';
import { useNavigation } from '@app/contexts/NavigationContext';
import {
  createViewerActions,
  ScrollActions,
  ZoomActions,
  PanActions,
  SelectionActions,
  SpreadActions,
  RotationActions,
  SearchActions,
  ExportActions,
  BookmarkActions,
  PrintActions,
} from '@app/contexts/viewer/viewerActions';
import {
  BridgeRef,
  BridgeApiMap,
  BridgeStateMap,
  BridgeKey,
  ViewerBridgeRegistry,
  createBridgeRegistry,
  registerBridge as setBridgeRef,
  ScrollState,
  ZoomState,
  PanState,
  SelectionState,
  SpreadState,
  RotationState,
  SearchState,
  ExportState,
  ThumbnailAPIWrapper,
  BookmarkState,
} from '@app/contexts/viewer/viewerBridges';
import { SpreadMode } from '@embedpdf/plugin-spread/react';

function useImmediateNotifier<Args extends unknown[]>() {
  const callbacksRef = useRef(new Set<(...args: Args) => void>());

  const register = useCallback((callback: (...args: Args) => void) => {
    callbacksRef.current.add(callback);
    return () => {
      callbacksRef.current.delete(callback);
    };
  }, []);

  const trigger = useCallback((...args: Args) => {
    callbacksRef.current.forEach(cb => {
      try {
        cb(...args);
      } catch (error) {
        console.error('Immediate callback error:', error);
      }
    });
  }, []);

  return { register, trigger };
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
  isBookmarkSidebarVisible: boolean;
  toggleBookmarkSidebar: () => void;

  // Search interface visibility
  isSearchInterfaceVisible: boolean;
  searchInterfaceActions: {
    open: () => void;
    close: () => void;
    toggle: () => void;
  };

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
  getBookmarkState: () => BookmarkState;
  hasBookmarkSupport: () => boolean;

  // Immediate update callbacks
  registerImmediateZoomUpdate: (callback: (percent: number) => void) => () => void;
  registerImmediateScrollUpdate: (callback: (currentPage: number, totalPages: number) => void) => () => void;
  registerImmediateSpreadUpdate: (callback: (mode: SpreadMode, isDualPage: boolean) => void) => () => void;

  // Internal - for bridges to trigger immediate updates
  triggerImmediateScrollUpdate: (currentPage: number, totalPages: number) => void;
  triggerImmediateZoomUpdate: (zoomPercent: number) => void;
  triggerImmediateSpreadUpdate: (mode: SpreadMode, isDualPage?: boolean) => void;

  // Action handlers - call EmbedPDF APIs directly
  scrollActions: ScrollActions;
  zoomActions: ZoomActions;
  panActions: PanActions;
  selectionActions: SelectionActions;
  spreadActions: SpreadActions;
  rotationActions: RotationActions;
  searchActions: SearchActions;
  exportActions: ExportActions;
  bookmarkActions: BookmarkActions;
  printActions: PrintActions;

  // Bridge registration - internal use by bridges  
  registerBridge: <K extends BridgeKey>(
    type: K,
    ref: BridgeRef<BridgeStateMap[K], BridgeApiMap[K]>
  ) => void;
}

export const ViewerContext = createContext<ViewerContextType | null>(null);

interface ViewerProviderProps {
  children: ReactNode;
}

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children }) => {
  // UI state - only state directly managed by this context
  const [isThumbnailSidebarVisible, setIsThumbnailSidebarVisible] = useState(false);
  const [isBookmarkSidebarVisible, setIsBookmarkSidebarVisible] = useState(false);
  const [isSearchInterfaceVisible, setSearchInterfaceVisible] = useState(false);
  const [isAnnotationsVisible, setIsAnnotationsVisible] = useState(true);
  const [isAnnotationMode, setIsAnnotationModeState] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Get current navigation state to check if we're in sign mode
  useNavigation();

  // Bridge registry - bridges register their state and APIs here
  const bridgeRefs = useRef<ViewerBridgeRegistry>(createBridgeRegistry());

  const {
    register: registerImmediateZoomUpdate,
    trigger: triggerImmediateZoomInternal,
  } = useImmediateNotifier<[number]>();
  const {
    register: registerImmediateScrollUpdate,
    trigger: triggerImmediateScrollInternal,
  } = useImmediateNotifier<[number, number]>();
  const {
    register: registerImmediateSpreadUpdate,
    trigger: triggerImmediateSpreadInternal,
  } = useImmediateNotifier<[SpreadMode, boolean]>();

  const triggerImmediateZoomUpdate = useCallback(
    (percent: number) => {
      triggerImmediateZoomInternal(percent);
    },
    [triggerImmediateZoomInternal]
  );

  const triggerImmediateScrollUpdate = useCallback(
    (currentPage: number, totalPages: number) => {
      triggerImmediateScrollInternal(currentPage, totalPages);
    },
    [triggerImmediateScrollInternal]
  );

  const triggerImmediateSpreadUpdate = useCallback(
    (mode: SpreadMode, isDualPage: boolean = mode !== SpreadMode.None) => {
      triggerImmediateSpreadInternal(mode, isDualPage);
    },
    [triggerImmediateSpreadInternal]
  );

  const registerBridge = useCallback(
    <K extends BridgeKey>(
      type: K,
      ref: BridgeRef<BridgeStateMap[K], BridgeApiMap[K]>
    ) => {
      setBridgeRef(bridgeRefs.current, type, ref);
    },
    []
  );

  const toggleThumbnailSidebar = () => {
    setIsThumbnailSidebarVisible(prev => !prev);
  };

  const toggleBookmarkSidebar = () => {
    setIsBookmarkSidebarVisible(prev => !prev);
  };

  const searchInterfaceActions = {
    open: () => setSearchInterfaceVisible(true),
    close: () => setSearchInterfaceVisible(false),
    toggle: () => setSearchInterfaceVisible(prev => !prev),
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

  const getBookmarkState = (): BookmarkState => {
    return (
      bridgeRefs.current.bookmark?.state || {
        bookmarks: null,
        isLoading: false,
        error: null,
      }
    );
  };

  const hasBookmarkSupport = () => Boolean(bridgeRefs.current.bookmark);

  // Action handlers - call APIs directly
  const {
    scrollActions,
    zoomActions,
    panActions,
    selectionActions,
    spreadActions,
    rotationActions,
    searchActions,
    exportActions,
    bookmarkActions,
    printActions,
  } = createViewerActions({
    registry: bridgeRefs,
    getScrollState,
    getZoomState,
    triggerImmediateZoomUpdate,
  });

  const value: ViewerContextType = {
    // UI state
    isThumbnailSidebarVisible,
    toggleThumbnailSidebar,
    isBookmarkSidebarVisible,
    toggleBookmarkSidebar,

    // Search interface
    isSearchInterfaceVisible,
    searchInterfaceActions,

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
    getBookmarkState,
    hasBookmarkSupport,

    // Immediate updates
    registerImmediateZoomUpdate,
    registerImmediateScrollUpdate,
    registerImmediateSpreadUpdate,
    triggerImmediateScrollUpdate,
    triggerImmediateZoomUpdate,
    triggerImmediateSpreadUpdate,

    // Actions
    scrollActions,
    zoomActions,
    panActions,
    selectionActions,
    spreadActions,
    rotationActions,
    searchActions,
    exportActions,
    bookmarkActions,
    printActions,

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
