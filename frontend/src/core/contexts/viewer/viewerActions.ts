import { MutableRefObject } from 'react';
import { SpreadMode } from '@embedpdf/plugin-spread/react';
import {
  ViewerBridgeRegistry,
  ScrollState,
  ZoomState,
} from '@app/contexts/viewer/viewerBridges';
import { PdfBookmarkObject, PdfAttachmentObject } from '@embedpdf/models';

export interface ScrollActions {
  scrollToPage: (page: number, behavior?: 'smooth' | 'instant') => void;
  scrollToFirstPage: () => void;
  scrollToPreviousPage: () => void;
  scrollToNextPage: () => void;
  scrollToLastPage: () => void;
}

export interface ZoomActions {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleMarqueeZoom: () => void;
  requestZoom: (level: any, center?: any) => void;
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

export interface AttachmentActions {
  getAttachments: () => Promise<PdfAttachmentObject[] | null>;
  downloadAttachment: (attachment: PdfAttachmentObject) => void;
  clearAttachments: () => void;
  setLocalAttachments: (attachments: PdfAttachmentObject[] | null, error?: string | null) => void;
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
  attachmentActions: AttachmentActions;
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
    scrollToPage: (page: number, behavior?: 'smooth' | 'instant') => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToPage) {
        try {
          api.scrollToPage({ pageNumber: page, behavior: behavior || 'smooth' });
        } catch (error) {
          // Silently handle "Strategy not found" errors that occur during document transitions
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ScrollActions] scrollToPage failed (document may be transitioning):', error);
          }
        }
      }
    },
    scrollToFirstPage: () => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToPage) {
        try {
          api.scrollToPage({ pageNumber: 1 });
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ScrollActions] scrollToFirstPage failed:', error);
          }
        }
      }
    },
    scrollToPreviousPage: () => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToPreviousPage) {
        try {
          api.scrollToPreviousPage();
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ScrollActions] scrollToPreviousPage failed:', error);
          }
        }
      }
    },
    scrollToNextPage: () => {
      const api = registry.current.scroll?.api;
      if (api?.scrollToNextPage) {
        try {
          api.scrollToNextPage();
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ScrollActions] scrollToNextPage failed:', error);
          }
        }
      }
    },
    scrollToLastPage: () => {
      const api = registry.current.scroll?.api;
      const state = getScrollState();
      if (api?.scrollToPage && state.totalPages > 0) {
        try {
          api.scrollToPage({ pageNumber: state.totalPages });
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ScrollActions] scrollToLastPage failed:', error);
          }
        }
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
    requestZoom: (level: any, center?: any) => {
      const api = registry.current.zoom?.api;
      if (api?.requestZoom) {
        api.requestZoom(level, center);
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
    attachmentActions: {
      getAttachments: async () => {
        const api = registry.current.attachment?.api;
        if (!api?.getAttachments) {
          return null;
        }
        return api.getAttachments();
      },
      downloadAttachment: (attachment) => {
        const api = registry.current.attachment?.api;
        api?.downloadAttachment?.(attachment);
      },
      clearAttachments: () => {
        const api = registry.current.attachment?.api;
        api?.clearAttachments?.();
      },
      setLocalAttachments: (attachments, error = null) => {
        const api = registry.current.attachment?.api;
        api?.setLocalAttachments?.(attachments ?? null, error);
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
