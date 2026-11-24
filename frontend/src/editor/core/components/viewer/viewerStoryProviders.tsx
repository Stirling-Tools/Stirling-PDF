import { useState, type ComponentType, type ReactNode } from "react";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import type { ZoomLevel } from "@embedpdf/plugin-zoom";
import type { PdfAttachmentObject, PdfBookmarkObject } from "@embedpdf/models";
import { FileContextProvider } from "@editor/contexts/FileContext";
import { ToolRegistryProvider } from "@editor/contexts/ToolRegistryProvider";
import { NavigationProvider } from "@editor/contexts/NavigationContext";
import { ToolWorkflowProvider } from "@editor/contexts/ToolWorkflowContext";
import { ViewerProvider, useViewer } from "@editor/contexts/ViewerContext";
import { SignatureProvider } from "@editor/contexts/SignatureContext";
import { WorkbenchBarProvider } from "@editor/contexts/WorkbenchBarContext";
import { SidebarProvider } from "@editor/contexts/SidebarContext";
import { SigningOverlayProvider } from "@editor/contexts/SigningOverlayContext";
import { RedactionProvider } from "@editor/contexts/RedactionContext";
import { FormFillProvider } from "@editor/tools/formFill/FormFillContext";
import { AnnotationProvider } from "@editor/contexts/AnnotationContext";
import { useViewerWorkbenchBarButtons } from "@editor/components/viewer/useViewerWorkbenchBarButtons";

/** What the stand-in document reports through the viewer's bridges. */
export interface StoryDocument {
  totalPages?: number;
  currentPage?: number;
  zoomPercent?: number;
  zoomLevel?: ZoomLevel;
  /** Omit to leave the document without bookmark support. */
  bookmarks?: PdfBookmarkObject[];
  /** Omit to leave the document without attachment support. */
  attachments?: PdfAttachmentObject[];
}

const noop = () => {};

/** A blank page with a few text lines, so thumbnails read as pages. */
function pageThumb(pageIndex: number): Blob {
  const lines = Array.from(
    { length: 9 },
    (_, i) =>
      `<rect x="14" y="${24 + i * 12}" width="${i % 3 === 2 ? 50 : 82}" height="4" fill="black" opacity="0.25"/>`,
  ).join("");
  // icon-lint-allow: runtime-generated-svg -- a stand-in page thumbnail, numbered per page
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="143"><rect width="110" height="143" fill="white"/><text x="14" y="16" font-size="9" font-family="sans-serif">Page ${pageIndex + 1}</text>${lines}</svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

/** Registers the stand-in document before anything below reads the viewer. */
function SeedDocument({
  doc,
  children,
}: {
  doc: StoryDocument;
  children: ReactNode;
}) {
  const { registerBridge } = useViewer();
  useState(() => {
    const zoomPercent = doc.zoomPercent ?? 100;
    registerBridge("scroll", {
      state: {
        currentPage: doc.currentPage ?? 1,
        totalPages: doc.totalPages ?? 12,
      },
      api: {
        scrollToPage: noop,
        scrollToPreviousPage: noop,
        scrollToNextPage: noop,
      },
    });
    registerBridge("zoom", {
      state: {
        currentZoom: zoomPercent / 100,
        zoomPercent,
        level: doc.zoomLevel,
      },
      api: {
        zoomIn: noop,
        zoomOut: noop,
        toggleMarqueeZoom: noop,
        requestZoom: noop,
      },
    });
    registerBridge("spread", {
      state: { spreadMode: SpreadMode.None },
      api: {
        setSpreadMode: noop,
        getSpreadMode: () => SpreadMode.None,
        toggleSpreadMode: noop,
        SpreadMode,
      },
    });
    registerBridge("rotation", {
      state: { rotation: 0 },
      api: {
        rotateForward: noop,
        rotateBackward: noop,
        setRotation: noop,
        getRotation: () => 0,
      },
    });
    registerBridge("pan", {
      state: { isPanning: false },
      api: { enable: noop, disable: noop, toggle: noop },
    });
    registerBridge("thumbnail", {
      state: null,
      api: {
        renderThumb: (pageIndex) => ({
          toPromise: () => Promise.resolve(pageThumb(pageIndex)),
        }),
      },
    });
    if (doc.bookmarks) {
      const bookmarks = doc.bookmarks;
      registerBridge("bookmark", {
        state: { bookmarks, isLoading: false, error: null },
        api: {
          fetchBookmarks: () => Promise.resolve(bookmarks),
          clearBookmarks: noop,
          setLocalBookmarks: noop,
        },
      });
    }
    if (doc.attachments) {
      const attachments = doc.attachments;
      registerBridge("attachment", {
        state: { attachments, isLoading: false, error: null },
        api: {
          getAttachments: () => Promise.resolve(attachments),
          downloadAttachment: noop,
          clearAttachments: noop,
          setLocalAttachments: noop,
        },
      });
    }
  });
  return <>{children}</>;
}

/**
 * The providers the viewer chrome reads, with a stand-in document behind the
 * viewer's bridges in place of the pdfium engine.
 */
export function ViewerStoryProviders({
  doc = {},
  children,
}: {
  doc?: StoryDocument;
  children: ReactNode;
}) {
  return PROVIDERS.reduceRight<ReactNode>(
    (inner, Provider) => <Provider>{inner}</Provider>,
    <SeedDocument doc={doc}>{children}</SeedDocument>,
  );
}

/** Outermost first, in the order the app nests them. */
const PROVIDERS: ComponentType<{ children: ReactNode }>[] = [
  FileContextProvider,
  ToolRegistryProvider,
  NavigationProvider,
  ToolWorkflowProvider,
  SidebarProvider,
  ViewerProvider,
  SignatureProvider,
  SigningOverlayProvider,
  RedactionProvider,
  FormFillProvider,
  AnnotationProvider,
  WorkbenchBarProvider,
];

/** Registers the viewer's own bar buttons, as the open document does. */
export function ViewerBarButtons() {
  useViewerWorkbenchBarButtons();
  return null;
}
