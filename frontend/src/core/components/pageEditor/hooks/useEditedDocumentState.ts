import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FileId } from "@app/types/file";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";

interface UseEditedDocumentStateParams {
  initialDocument: PDFDocument | null;
  mergedPdfDocument: PDFDocument | null;
  reorderedPages: PDFPage[] | null;
  clearReorderedPages: () => void;
  fileOrder: FileId[];
  updateCurrentPages: (pages: PDFPage[] | null) => void;
}

export const useEditedDocumentState = ({
  initialDocument,
  mergedPdfDocument,
  reorderedPages,
  clearReorderedPages,
  fileOrder,
  updateCurrentPages,
}: UseEditedDocumentStateParams) => {
  const [editedDocument, setEditedDocument] = useState<PDFDocument | null>(null);
  const editedDocumentRef = useRef<PDFDocument | null>(null);
  const pagePositionCacheRef = useRef<Map<string, number>>(new Map());
  const pageNeighborCacheRef = useRef<Map<string, string | null>>(new Map());
  const lastSyncedSignatureRef = useRef<string | null>(null);

  // Clone the initial document once so we can safely mutate working state
  useEffect(() => {
    if (!initialDocument || editedDocument) return;

    setEditedDocument({
      ...initialDocument,
      pages: initialDocument.pages.map((page) => ({ ...page })),
    });
  }, [initialDocument, editedDocument]);

  // Apply reorders triggered elsewhere in the editor
  useEffect(() => {
    if (!reorderedPages || !editedDocument) return;

    setEditedDocument({
      ...editedDocument,
      pages: reorderedPages,
    });
    clearReorderedPages();
  }, [reorderedPages, editedDocument, clearReorderedPages]);

  // Keep ref synced so effects can read latest without re-running
  useEffect(() => {
    editedDocumentRef.current = editedDocument;
  }, [editedDocument]);

  // Cache page positions to help future insertions preserve intent
  useEffect(() => {
    if (!editedDocument) return;

    const positionCache = pagePositionCacheRef.current;
    const neighborCache = pageNeighborCacheRef.current;
    const pages = editedDocument.pages;

    pages.forEach((page, index) => {
      positionCache.set(page.id, index);
      neighborCache.set(page.id, index > 0 ? pages[index - 1].id : null);
    });
  }, [editedDocument]);

  const fileOrderKey = useMemo(() => fileOrder.join(","), [fileOrder]);
  const mergedDocSignature = useMemo(() => {
    if (!mergedPdfDocument?.pages) return "";
    return mergedPdfDocument.pages.map((page) => page.id).join(",");
  }, [mergedPdfDocument]);

  useEffect(() => {
    if (!mergedPdfDocument) {
      lastSyncedSignatureRef.current = null;
    }
  }, [mergedPdfDocument]);

  // Keep editedDocument in sync with out-of-band insert/remove events (e.g. uploads finishing)
  useEffect(() => {
    const currentEditedDocument = editedDocumentRef.current;
    if (!mergedPdfDocument || !currentEditedDocument) return;

    const signatureChanged =
      mergedDocSignature !== lastSyncedSignatureRef.current;
    const metadataChanged =
      currentEditedDocument.id !== mergedPdfDocument.id ||
      currentEditedDocument.file !== mergedPdfDocument.file ||
      currentEditedDocument.name !== mergedPdfDocument.name;

    if (!signatureChanged && !metadataChanged) return;

    setEditedDocument((prev) => {
      if (!prev) return prev;

      let pages = prev.pages;

      if (signatureChanged) {
        const sourcePages = mergedPdfDocument.pages;
        const sourceIds = new Set(sourcePages.map((p) => p.id));
        const prevIds = new Set(prev.pages.map((p) => p.id));

        const newPages: PDFPage[] = [];
        for (const page of sourcePages) {
          if (!prevIds.has(page.id)) {
            newPages.push(page);
          }
        }

        const hasAdditions = newPages.length > 0;
        const isEphemeralPage = (page: PDFPage) =>
          Boolean(page.isBlankPage || page.isPlaceholder);

        let hasRemovals = false;
        for (const page of prev.pages) {
          if (!sourceIds.has(page.id) && !isEphemeralPage(page)) {
            hasRemovals = true;
            break;
          }
        }

        if (hasAdditions || hasRemovals) {
          pages = [...prev.pages];

          const placeholderPositions = new Map<FileId, number>();
          pages.forEach((page, index) => {
            if (page.isPlaceholder && page.originalFileId) {
              placeholderPositions.set(page.originalFileId, index);
            }
          });

          const nextInsertIndexByFile = new Map(placeholderPositions);

          if (hasRemovals) {
            pages = pages.filter(
              (page) => sourceIds.has(page.id) || isEphemeralPage(page)
            );
          }

          if (hasAdditions) {
            const mergedIndexMap = new Map<string, number>();
            sourcePages.forEach((page, index) =>
              mergedIndexMap.set(page.id, index)
            );

            const additions = newPages
              .map((page) => ({
                page,
                cachedIndex: pagePositionCacheRef.current.get(page.id),
                mergedIndex: mergedIndexMap.get(page.id) ?? sourcePages.length,
                neighborId: pageNeighborCacheRef.current.get(page.id),
              }))
              .sort((a, b) => {
                const aIndex = a.cachedIndex ?? a.mergedIndex;
                const bIndex = b.cachedIndex ?? b.mergedIndex;
                if (aIndex !== bIndex) return aIndex - bIndex;
                return a.mergedIndex - b.mergedIndex;
              });

            additions.forEach(({ page, neighborId, cachedIndex, mergedIndex }) => {
              if (pages.some((existing) => existing.id === page.id)) {
                return;
              }

              let insertIndex: number;
              const originalFileId = page.originalFileId;
              const placeholderIndex =
                originalFileId !== undefined
                  ? nextInsertIndexByFile.get(originalFileId)
                  : undefined;

              if (originalFileId && placeholderIndex !== undefined) {
                insertIndex = Math.min(placeholderIndex, pages.length);
                nextInsertIndexByFile.set(originalFileId, insertIndex + 1);
              } else if (neighborId === null) {
                insertIndex = 0;
              } else if (neighborId) {
                const neighborIndex = pages.findIndex((p) => p.id === neighborId);
                if (neighborIndex !== -1) {
                  insertIndex = neighborIndex + 1;
                } else {
                  const fallbackIndex = cachedIndex ?? mergedIndex ?? pages.length;
                  insertIndex = Math.min(fallbackIndex, pages.length);
                }
              } else {
                const fallbackIndex = cachedIndex ?? mergedIndex ?? pages.length;
                insertIndex = Math.min(fallbackIndex, pages.length);
              }

              const clonedPage = { ...page };
              pages.splice(insertIndex, 0, clonedPage);
            });
          }

          pages = pages.map((page, index) => ({
            ...page,
            pageNumber: index + 1,
          }));
        }
      }

      const shouldReplaceBase = metadataChanged || signatureChanged;
      const baseDocument = shouldReplaceBase
        ? {
            ...mergedPdfDocument,
            destroy: prev.destroy,
          }
        : prev;

      if (baseDocument === prev && pages === prev.pages) {
        return prev;
      }

      return {
        ...baseDocument,
        pages,
        totalPages: pages.length,
      };
    });

    if (signatureChanged) {
      lastSyncedSignatureRef.current = mergedDocSignature;
    }
  }, [mergedPdfDocument, fileOrderKey, mergedDocSignature]);

  const displayDocument = editedDocument || initialDocument;

  const getEditedDocument = useCallback(
    () => editedDocumentRef.current,
    []
  );

  useEffect(() => {
    updateCurrentPages(displayDocument?.pages ?? null);
  }, [displayDocument, updateCurrentPages]);

  return {
    editedDocument,
    setEditedDocument,
    displayDocument,
    getEditedDocument,
  };
};

export type UseEditedDocumentStateReturn = ReturnType<
  typeof useEditedDocumentState
>;
