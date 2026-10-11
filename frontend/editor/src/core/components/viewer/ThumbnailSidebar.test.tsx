import { act, render, screen, waitFor } from "@testing-library/react";
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

const { renderThumbMock, thumbnailAPI, viewer, pluginDoc } = vi.hoisted(() => {
  const renderThumbMock = vi.fn();
  const pluginDoc = {
    id: "doc-1" as string | null,
    ready: true,
  };
  const thumbnailAPI = {
    renderThumb: renderThumbMock,
    forDocument: (_docId: string) => ({ renderThumb: renderThumbMock }),
  };
  const viewer = {
    getScrollState: () => scrollState,
    scrollActions,
    getThumbnailAPI: () => thumbnailAPI,
    registerImmediateScrollUpdate: () => () => {},
  };
  return { renderThumbMock, thumbnailAPI, viewer, pluginDoc };
});

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

vi.mock("@app/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => pluginDoc.id,
  useDocumentReady: () => pluginDoc.ready,
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
    pluginDoc.id = "doc-1";
    pluginDoc.ready = true;
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

  it("wakes parked workers when current page changes in fallback mode", async () => {
    scrollState.currentPage = 1;
    scrollState.totalPages = 20;

    const requestedPages: number[] = [];
    renderThumbMock.mockImplementation((pageIndex: number) => {
      requestedPages.push(pageIndex);
      return {
        toPromise: () =>
          Promise.resolve(
            new Blob([`page-${pageIndex}`], { type: "image/png" }),
          ),
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

    // jsdom has no IntersectionObserver, so the window falls back to the
    // current page plus overscan: pages 0..6 render, then workers park.
    await waitFor(() => {
      expect(requestedPages.length).toBe(7);
    });

    // Move far away without resolving anything by hand: only a wake lets
    // the parked workers pick up the new window (pages 13..19).
    scrollState.currentPage = 20;
    rerender(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-1"
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(requestedPages.length).toBe(14);
    });
    expect(requestedPages.slice(7).sort((a, b) => a - b)).toEqual([
      13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it("discards buffered thumbnails when the file changes before flush", async () => {
    vi.useFakeTimers();
    try {
      scrollState.currentPage = 1;
      scrollState.totalPages = 3;
      let resolveThumb!: (blob: Blob) => void;
      renderThumbMock.mockImplementation(() => ({
        toPromise: () =>
          new Promise<Blob>((resolve) => {
            resolveThumb = resolve;
          }),
      }));

      const { rerender } = render(
        <MantineProvider>
          <ThumbnailSidebar
            visible={true}
            onToggle={vi.fn()}
            activeFileId="test-file-1"
          />
        </MantineProvider>,
      );

      // One worker finishes; the commit sits in the buffer with the flush
      // timer still pending.
      resolveThumb(new Blob(["page-0"], { type: "image/png" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Switching files cancels the generation: the pending flush must die
      // with it instead of committing a stale thumbnail.
      rerender(
        <MantineProvider>
          <ThumbnailSidebar
            visible={true}
            onToggle={vi.fn()}
            activeFileId="test-file-2"
          />
        </MantineProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(screen.queryByAltText("Page 1 thumbnail")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds thumbnail generation to the newly loaded document on file switch", async () => {
    vi.useFakeTimers();
    try {
      scrollState.currentPage = 1;
      scrollState.totalPages = 10;
      pluginDoc.id = "doc-A";
      pluginDoc.ready = true;

      // Distinct scoped APIs per plugin document: stale workers for doc-A
      // must never commit into file-B's state.
      const resolversA: Array<(blob: Blob) => void> = [];
      const resolversB: Array<(blob: Blob) => void> = [];
      const requestedA: number[] = [];
      const requestedB: number[] = [];
      const forDocumentMock = vi.fn((docId: string) => ({
        renderThumb: (pageIndex: number) => ({
          toPromise: () =>
            new Promise<Blob>((resolve) => {
              if (docId === "doc-A") {
                requestedA.push(pageIndex);
                resolversA.push(resolve);
              } else {
                requestedB.push(pageIndex);
                resolversB.push(resolve);
              }
            }),
        }),
      }));
      thumbnailAPI.forDocument =
        forDocumentMock as unknown as typeof thumbnailAPI.forDocument;

      const { rerender } = render(
        <MantineProvider>
          <ThumbnailSidebar
            visible={true}
            onToggle={vi.fn()}
            activeFileId="file-A"
          />
        </MantineProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Workers claimed the first window of doc-A and parked on it.
      expect([...requestedA].sort((a, b) => a - b)).toEqual([0, 1, 2]);

      // Switching files restarts generation scoped to the new document.
      pluginDoc.id = "doc-B";
      rerender(
        <MantineProvider>
          <ThumbnailSidebar
            visible={true}
            onToggle={vi.fn()}
            activeFileId="file-B"
          />
        </MantineProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(forDocumentMock).toHaveBeenCalledWith("doc-B");
      expect([...requestedB].sort((a, b) => a - b)).toEqual([0, 1, 2]);

      // Stale doc-A workers resolve after the switch: nothing may commit.
      resolversA.forEach((resolve) =>
        resolve(new Blob(["stale"], { type: "image/png" })),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.queryByAltText("Page 1 thumbnail")).not.toBeInTheDocument();

      // The new document's workers still land their thumbnails.
      resolversB.forEach((resolve) =>
        resolve(new Blob(["fresh"], { type: "image/png" })),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    } finally {
      thumbnailAPI.forDocument = (_docId: string) => ({
        renderThumb: renderThumbMock,
      });
      vi.useRealTimers();
    }
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
