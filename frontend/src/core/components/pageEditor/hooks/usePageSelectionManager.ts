import { useCallback, useEffect, useRef, useState } from "react";

import { PDFDocument } from "@app/types/pageEditor";
import { parseSelection } from "@app/utils/bulkselection/parseSelection";

interface UsePageSelectionManagerParams {
  displayDocument: PDFDocument | null;
  selectedPageIds: string[];
  setSelectedPageIds: (ids: string[]) => void;
  setSelectionMode: (enabled: boolean) => void;
  toggleSelectAll: (ids: string[]) => void;
  activeFilesSignature: string;
}

export const usePageSelectionManager = ({
  displayDocument,
  selectedPageIds,
  setSelectedPageIds,
  setSelectionMode,
  toggleSelectAll,
  activeFilesSignature,
}: UsePageSelectionManagerParams) => {
  const [csvInput, setCsvInput] = useState<string>("");
  const hasInitializedSelection = useRef(false);
  const previousPageIdsRef = useRef<Set<string>>(new Set());

  const totalPages = displayDocument?.pages.length ?? 0;

  const getPageNumbersFromIds = useCallback(
    (pageIds: string[]) => {
      if (!displayDocument) return [];
      return pageIds
        .map((id) => {
          const page = displayDocument.pages.find((p) => p.id === id);
          return page?.pageNumber || 0;
        })
        .filter((num) => num > 0);
    },
    [displayDocument]
  );

  const getPageIdsFromNumbers = useCallback(
    (pageNumbers: number[]) => {
      if (!displayDocument) return [];
      return pageNumbers
        .map((num) => {
          const page = displayDocument.pages.find((p) => p.pageNumber === num);
          return page?.id || "";
        })
        .filter((id) => id !== "");
    },
    [displayDocument]
  );

  useEffect(() => {
    if (
      displayDocument &&
      displayDocument.pages.length > 0 &&
      !hasInitializedSelection.current
    ) {
      const allPageIds = displayDocument.pages.map((page) => page.id);
      setSelectedPageIds(allPageIds);
      setSelectionMode(true);
      hasInitializedSelection.current = true;
    }
  }, [displayDocument, setSelectedPageIds, setSelectionMode]);

  useEffect(() => {
    if (!displayDocument || displayDocument.pages.length === 0) {
      previousPageIdsRef.current = new Set();
      return;
    }

    const currentIds = new Set(displayDocument.pages.map((page) => page.id));
    const newlyAddedPageIds: string[] = [];
    currentIds.forEach((id) => {
      if (!previousPageIdsRef.current.has(id)) {
        newlyAddedPageIds.push(id);
      }
    });

    if (newlyAddedPageIds.length > 0) {
      const next = new Set(selectedPageIds);
      newlyAddedPageIds.forEach((id) => next.add(id));
      setSelectedPageIds(Array.from(next));
    }

    previousPageIdsRef.current = currentIds;
  }, [displayDocument, selectedPageIds, setSelectedPageIds]);

  useEffect(() => {
    setCsvInput("");
  }, [activeFilesSignature]);

  const handleSelectAll = useCallback(() => {
    if (!displayDocument) return;
    const allPageIds = displayDocument.pages.map((page) => page.id);
    toggleSelectAll(allPageIds);
  }, [displayDocument, toggleSelectAll]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPageIds([]);
  }, [setSelectedPageIds]);

  const handleSetSelectedPages = useCallback(
    (pageNumbers: number[]) => {
      const pageIds = getPageIdsFromNumbers(pageNumbers);
      setSelectedPageIds(pageIds);
    },
    [getPageIdsFromNumbers, setSelectedPageIds]
  );

  const updatePagesFromCSV = useCallback(
    (override?: string) => {
      if (totalPages === 0) return;
      const normalized = parseSelection(override ?? csvInput, totalPages);
      handleSetSelectedPages(normalized);
    },
    [csvInput, totalPages, handleSetSelectedPages]
  );

  return {
    csvInput,
    setCsvInput,
    totalPages,
    getPageNumbersFromIds,
    getPageIdsFromNumbers,
    handleSelectAll,
    handleDeselectAll,
    handleSetSelectedPages,
    updatePagesFromCSV,
  };
};

export type UsePageSelectionManagerReturn = ReturnType<
  typeof usePageSelectionManager
>;
