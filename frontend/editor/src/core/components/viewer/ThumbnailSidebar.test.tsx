import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThumbnailSidebar } from "@app/components/viewer/ThumbnailSidebar";

const scrollState = vi.hoisted(() => ({
  currentPage: 1,
  totalPages: 3,
}));

const scrollActions = vi.hoisted(() => ({
  scrollToPage: vi.fn(),
}));

const { renderThumbMock, viewer } = vi.hoisted(() => {
  const renderThumbMock = vi.fn();
  const thumbnailAPI = {
    renderThumb: renderThumbMock,
  };
  const viewer = {
    getScrollState: () => scrollState,
    scrollActions,
    getThumbnailAPI: () => thumbnailAPI,
  };
  return { renderThumbMock, viewer };
});

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) => {
      let str = fallback ?? _key;
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          str = str.replace(new RegExp(`{{${k}}}`, "g"), String(v));
        }
      }
      return str;
    },
  }),
}));

describe("ThumbnailSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scrollState.currentPage = 1;
    scrollState.totalPages = 3;
    global.URL.createObjectURL = vi.fn(
      () => "blob:http://localhost/test-thumb-blob",
    );
    global.URL.revokeObjectURL = vi.fn();
    renderThumbMock.mockImplementation((pageIndex: number) => ({
      toPromise: () =>
        Promise.resolve(new Blob([`page-${pageIndex}`], { type: "image/png" })),
    }));
  });

  it("renders page items with skeletons when visible", async () => {
    render(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText("Page 3")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });
  });

  it("loads and displays thumbnail images without discarding them across scroll", async () => {
    const { rerender } = render(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });

    // Simulate page scrolling
    scrollState.currentPage = 2;
    rerender(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    // Page 1 thumbnail must remain loaded and not revoked/discarded
    expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
  });

  it("reprioritizes pending queue when current page changes during render", async () => {
    scrollState.currentPage = 1;
    scrollState.totalPages = 10;

    const deferredResolvers: Array<() => void> = [];
    const requestedPages: number[] = [];

    renderThumbMock.mockImplementation((pageIndex: number) => {
      requestedPages.push(pageIndex);
      return {
        toPromise: () =>
          new Promise<Blob>((resolve) => {
            deferredResolvers.push(() =>
              resolve(new Blob([`page-${pageIndex}`], { type: "image/png" })),
            );
          }),
      };
    });

    const { rerender } = render(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    // Initial batch starts 3 concurrent workers (pages 0, 1, 2 nearest to page 0)
    expect(requestedPages).toEqual([0, 1, 2]);

    // Change current page to page 10 (pageIndex 9) while workers are waiting
    scrollState.currentPage = 10;
    rerender(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    // Resolve one pending worker so it asks for the next page
    expect(deferredResolvers.length).toBe(3);
    deferredResolvers[0]();

    await waitFor(() => {
      expect(requestedPages.length).toBe(4);
    });

    // The next requested page must be nearest to page 9 (page index 9), not page index 3!
    expect(requestedPages[3]).toBe(9);
  });

  it("revokes blob URLs when sidebar closes", async () => {
    const { rerender } = render(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });

    rerender(
      <MantineProvider>
        <ThumbnailSidebar
          visible={false}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/test-thumb-blob",
    );
  });
});
