import { MutableRefObject } from 'react';
import { SpreadMode } from '@embedpdf/plugin-spread/react';
import {
  ViewerBridgeRegistry,
  ScrollState,
  ZoomState,
} from '@app/contexts/viewer/viewerBridges';
import { PdfBookmarkObject } from '@embedpdf/models';

export interface ScrollActions {
  scrollToPage: (page: number) => void;
  scrollToFirstPage: () => void;
  scrollToPreviousPage: () => void;
  scrollToNextPage: () => void;
  scrollToLastPage: () => void;
}

export interface ZoomActions {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleMarqueeZoom: () => void;
  requestZoom: (level: number) => void;
}

export interface PanActions {
  enablePan: () => void;
  disablePan: () => void;
  togglePan: () => void;
}

export interface SelectionActions {
  copyToClipboard: () => void;
  getSelectedText: () => string;
  getFormattedSelection: () => any;
}

export interface SpreadActions {
  setSpreadMode: (mode: SpreadMode) => void;
  getSpreadMode: () => SpreadMode | null;
  toggleSpreadMode: () => void;
}

export interface RotationActions {
  rotateForward: () => void;
  rotateBackward: () => void;
  setRotation: (rotation: number) => void;
  getRotation: () => number;
}

export interface SearchActions {
  search: (query: string) => Promise<any> | undefined;
  next: () => void;
  previous: () => void;
  clear: () => void;
  goToResult: (index: number) => void;
}

export interface ExportActions {
  download: () => void;
  saveAsCopy: () => Promise<ArrayBuffer | null>;
}

export interface BookmarkActions {
  fetchBookmarks: () => Promise<PdfBookmarkObject[] | null>;
  clearBookmarks: () => void;
  setLocalBookmarks: (bookmarks: PdfBookmarkObject[] | null, error?: string | null) => void;
}

export interface PrintActions {
  print: () => void;
}

export interface ViewerActionsBundle {
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
}

interface ViewerActionDependencies {
  registry: MutableRefObject<ViewerBridgeRegistry>;
  getScrollState: () => ScrollState;
  getZoomState: () => ZoomState;
  triggerImmediateZoomUpdate: (percent: number) => void;
}

export function createViewerActions({
  registry,
  getScrollState,
  getZoomState,
  triggerImmediateZoomUpdate,
}: ViewerActionDependencies): ViewerActionsBundle {
  const scrollActions: ScrollActions = {
    scrollToPage: (page: number) => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToPage) {
        api.scrollToPage({ pageNumber: page });
      }
    },
    scrollToFirstPage: () => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToPage) {
        api.scrollToPage({ pageNumber: 1 });
      }
    },
    scrollToPreviousPage: () => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToPreviousPage) {
        api.scrollToPreviousPage();
      }
    },
    scrollToNextPage: () => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToNextPage) {
        api.scrollToNextPage();
      }
    },
    scrollToLastPage: () => {
      const api = registry.current.scroll?.api;
      const state = getScrollState();
      if (api?.scrollToPage && state.totalPages > 0) {
        api.scrollToPage({ pageNumber: state.totalPages });
      }
    },
  };

  const zoomActions: ZoomActions = {
    zoomIn: () => {
      const api = registry.current.zoom?.api;
      if (api?.zoomIn) {
        const currentState = getZoomState();
        const newPercent = Math.min(
          Math.round(currentState.zoomPercent * 1.2),
          300
        );
        triggerImmediateZoomUpdate(newPercent);
        api.zoomIn();
      }
    },
    zoomOut: () => {
      const api = registry.current.zoom?.api;
      if (api?.zoomOut) {
        const currentState = getZoomState();
        const newPercent = Math.max(
          Math.round(currentState.zoomPercent / 1.2),
          20
        );
        triggerImmediateZoomUpdate(newPercent);
        api.zoomOut();
      }
    },
    toggleMarqueeZoom: () => {
      const api = registry.current.zoom?.api;
      if (api?.toggleMarqueeZoom) {
        api.toggleMarqueeZoom();
      }
    },
    requestZoom: (level: number) => {
      const api = registry.current.zoom?.api;
      if (api?.requestZoom) {
        api.requestZoom(level);
      }
    },
  };

  const panActions: PanActions = {
    enablePan: () => {
      const api = registry.current.pan?.api;
      if (api?.enable) {
        api.enable();
      }
    },
    disablePan: () => {
      const api = registry.current.pan?.api;
      if (api?.disable) {
        api.disable();
      }
    },
    togglePan: () => {
      const api = registry.current.pan?.api;
      if (api?.toggle) {
        api.toggle();
      }
    },
  };

  const selectionActions: SelectionActions = {
    copyToClipboard: () => {
      const api = registry.current.selection?.api;
      if (api?.copyToClipboard) {
        api.copyToClipboard();
      }
    },
    getSelectedText: () => {
      const api = registry.current.selection?.api;
      if (api?.getSelectedText) {
        return api.getSelectedText() ?? '';
      }
      return '';
    },
    getFormattedSelection: () => {
      const api = registry.current.selection?.api;
      if (api?.getFormattedSelection) {
        return api.getFormattedSelection();
      }
      return null;
    },
  };

  const spreadActions: SpreadActions = {
    setSpreadMode: (mode: SpreadMode) => {
      const api = registry.current.spread?.api;
      if (api?.setSpreadMode) {
        api.setSpreadMode(mode);
      }
    },
    getSpreadMode: () => {
      const api = registry.current.spread?.api;
      if (api?.getSpreadMode) {
        return api.getSpreadMode();
      }
      return null;
    },
    toggleSpreadMode: () => {
      const api = registry.current.spread?.api;
      if (api?.toggleSpreadMode) {
        api.toggleSpreadMode();
      }
    },
  };

  const rotationActions: RotationActions = {
    rotateForward: () => {
      const api = registry.current.rotation?.api;
      if (api?.rotateForward) {
        api.rotateForward();
      }
    },
    rotateBackward: () => {
      const api = registry.current.rotation?.api;
      if (api?.rotateBackward) {
        api.rotateBackward();
      }
    },
    setRotation: (rotation: number) => {
      const api = registry.current.rotation?.api;
      if (api?.setRotation) {
        api.setRotation(rotation);
      }
    },
    getRotation: () => {
      const api = registry.current.rotation?.api;
      if (api?.getRotation) {
        return api.getRotation();
      }
      return 0;
    },
  };

  const searchActions: SearchActions = {
    search: (query: string) => {
      const api = registry.current.search?.api;
      if (api?.search) {
        return api.search(query);
      }
    },
    next: () => {
      const api = registry.current.search?.api;
      if (api?.next) {
        api.next();
      }
    },
    previous: () => {
      const api = registry.current.search?.api;
      if (api?.previous) {
        api.previous();
      }
    },
    clear: () => {
      const api = registry.current.search?.api;
      if (api?.clear) {
        api.clear();
      }
    },
    goToResult: (index: number) => {
      const api = registry.current.search?.api;
      if (api?.goToResult) {
        api.goToResult(index);
      }
    },
  };

  const exportActions: ExportActions = {
    download: () => {
      const api = registry.current.export?.api;
      if (api?.download) {
        api.download();
      }
    },
    saveAsCopy: async () => {
      const api = registry.current.export?.api;
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
    },
  };

  return {
    scrollActions,
    zoomActions,
    panActions,
    selectionActions,
    spreadActions,
    rotationActions,
    searchActions,
    exportActions,
    bookmarkActions: {
      fetchBookmarks: async () => {
        const api = registry.current.bookmark?.api;
        if (!api?.fetchBookmarks) {
          return null;
        }
        return api.fetchBookmarks();
      },
      clearBookmarks: () => {
        const api = registry.current.bookmark?.api;
        api?.clearBookmarks?.();
      },
      setLocalBookmarks: (bookmarks, error = null) => {
        const api = registry.current.bookmark?.api;
        api?.setLocalBookmarks?.(bookmarks ?? null, error);
      },
    },
    printActions: {
      print: () => {
        const api = registry.current.print?.api;
        if (api?.print) {
          api.print();
        }
      },
    },
  };
}
