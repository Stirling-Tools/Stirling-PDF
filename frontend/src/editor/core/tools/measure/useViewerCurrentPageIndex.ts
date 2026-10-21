import { useEffect, useState } from "react";
import { useViewer } from "@app/contexts/ViewerContext";

/** Zero-based index of the page the viewer is scrolled to. */
export function useViewerCurrentPageIndex(): number {
  const { getScrollState, registerImmediateScrollUpdate } = useViewer();
  const [pageNumber, setPageNumber] = useState(
    () => getScrollState().currentPage,
  );

  useEffect(
    () =>
      registerImmediateScrollUpdate((currentPage) =>
        setPageNumber(currentPage),
      ),
    [registerImmediateScrollUpdate],
  );

  return Math.max(0, pageNumber - 1);
}
