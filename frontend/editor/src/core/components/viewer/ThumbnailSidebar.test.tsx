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

const renderThumbMock = vi.fn();

const viewer = vi.hoisted(() => ({
  getScrollState: () => scrollState,
  scrollActions,
  getThumbnailAPI: () => ({
    renderThumb: renderThumbMock,
  }),
}));

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
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
