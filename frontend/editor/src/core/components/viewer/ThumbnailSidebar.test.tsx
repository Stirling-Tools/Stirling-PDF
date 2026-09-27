import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThumbnailSidebar } from "@app/components/viewer/ThumbnailSidebar";

const viewer = vi.hoisted(() => {
  const scrollState = { currentPage: 1, totalPages: 3 };
  const scrollActions = { scrollToPage: vi.fn() };
  const renderThumbMock = vi.fn();
  const thumbnailAPI = { renderThumb: renderThumbMock };
  const scrollCallbacks = new Set<(currentPage: number) => void>();
  return {
    scrollState,
    scrollActions,
    renderThumbMock,
    thumbnailAPI,
    scrollCallbacks,
    registerImmediateScrollUpdate: (callback: (page: number) => void) => {
      scrollCallbacks.add(callback);
      return () => {
        scrollCallbacks.delete(callback);
      };
    },
    emitScroll: (page: number) => {
      scrollCallbacks.forEach((callback) => callback(page));
    },
  };
});

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    getScrollState: () => viewer.scrollState,
    scrollActions: viewer.scrollActions,
    getThumbnailAPI: () => viewer.thumbnailAPI,
    registerImmediateScrollUpdate: viewer.registerImmediateScrollUpdate,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function renderSidebar(activeFileId: string, visible = true) {
  return render(
    <MantineProvider>
      <ThumbnailSidebar
        visible={visible}
        onToggle={vi.fn()}
        activeFileId={activeFileId}
      />
    </MantineProvider>,
  );
}

describe("ThumbnailSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewer.scrollState.currentPage = 1;
    viewer.scrollState.totalPages = 3;
    viewer.scrollCallbacks.clear();
    global.URL.createObjectURL = vi.fn(
      () => "blob:http://localhost/test-thumb-blob",
    );
    global.URL.revokeObjectURL = vi.fn();
    viewer.renderThumbMock.mockImplementation((pageIndex: number) => ({
      toPromise: () =>
        Promise.resolve(new Blob([`page-${pageIndex}`], { type: "image/png" })),
    }));
  });

  it("renders page items with skeletons when visible", async () => {
    renderSidebar("test-file-1");

    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText("Page 3")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });
  });

  it("loads and displays thumbnail images without discarding them across scroll", async () => {
    const { rerender } = renderSidebar("test-file-1");

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });

    // Simulate page scrolling
    viewer.scrollState.currentPage = 2;
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

  it("tracks the current page through the scroll notifier subscription", async () => {
    const { unmount } = renderSidebar("test-file-1");

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });
    expect(viewer.scrollCallbacks.size).toBe(1);

    viewer.emitScroll(2);
    unmount();
    expect(viewer.scrollCallbacks.size).toBe(0);
  });

  it("regenerates thumbnails when the active file changes", async () => {
    const { rerender } = renderSidebar("test-file-a");

    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });
    const callsForFirstFile = viewer.renderThumbMock.mock.calls.length;

    rerender(
      <MantineProvider>
        <ThumbnailSidebar
          visible={true}
          onToggle={vi.fn()}
          activeFileId="test-file-b"
        />
      </MantineProvider>,
    );

    expect(screen.queryByAltText("Page 1 thumbnail")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByAltText("Page 1 thumbnail")).toBeInTheDocument();
    });
    expect(viewer.renderThumbMock.mock.calls.length).toBeGreaterThan(
      callsForFirstFile,
    );
  });

  it("revokes blob URLs when sidebar closes", async () => {
    const { rerender } = renderSidebar("test-file-1");

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
