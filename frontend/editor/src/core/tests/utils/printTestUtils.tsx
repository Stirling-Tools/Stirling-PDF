import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ViewerContext } from "@app/contexts/viewer/viewerContext";
import type { ViewerContextType } from "@app/contexts/viewer/viewerContext";

/** The only part of the viewer's thumbnail API the preview figure uses. */
export type PrintThumbnailAPI = {
  renderThumb: (index: number, scale: number) => unknown;
} | null;

/** A viewer stub: the print hooks only need the position and the document id. */
export const viewerAt = (
  pageCount: number,
  opts: {
    currentPage?: number;
    activeFileId?: string;
    thumbnailAPI?: PrintThumbnailAPI;
  } = {},
) =>
  ({
    activeFileId: opts.activeFileId ?? "doc-a",
    getScrollState: () => ({
      currentPage: opts.currentPage ?? 1,
      totalPages: pageCount,
    }),
    registerImmediateScrollUpdate: () => () => {},
    getThumbnailAPI: () => opts.thumbnailAPI ?? null,
  }) as unknown as ViewerContextType;

/**
 * Renders `tree` in the providers every print component expects.
 *
 * The returned `rerender` takes the unwrapped tree: a caller rebuilds only the
 * component under test, and the providers are rebuilt around it.
 */
export const renderInProviders = (
  tree: ReactElement,
  opts: { viewer?: ViewerContextType } = {},
) => {
  const wrap = (element: ReactElement) => (
    <MantineProvider env="test">
      {opts.viewer === undefined ? (
        element
      ) : (
        <ViewerContext.Provider value={opts.viewer}>
          {element}
        </ViewerContext.Provider>
      )}
    </MantineProvider>
  );
  const result = render(wrap(tree));

  return {
    ...result,
    rerender: (element: ReactElement) => result.rerender(wrap(element)),
  };
};
