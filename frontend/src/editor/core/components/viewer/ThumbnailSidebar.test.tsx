import { act, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbnailSidebar } from "@editor/components/viewer/ThumbnailSidebar";
import type {
  ViewerLayoutPage,
  ViewerPageLayout,
} from "@editor/contexts/viewer/ViewerPageTool";

const viewer = vi.hoisted(() => {
  const scroll = { currentPage: 1, totalPages: 2 };
  const thumbnailAPI = {
    renderThumb: (pageIndex: number) => ({
      toPromise: () => Promise.resolve(new Blob([`page ${pageIndex}`])),
    }),
  };
  return {
    getScrollState: () => scroll,
    scrollActions: { scrollToPage: () => undefined },
    getThumbnailAPI: () => thumbnailAPI,
  };
});

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

vi.mock("@mantine/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mantine/core")>()),
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const page: ViewerLayoutPage = { width: 600, height: 800, quarterTurns: 0 };

function changingLayout() {
  const listeners = new Set<() => void>();
  let pages: readonly ViewerLayoutPage[] | null = null;
  const layout: ViewerPageLayout = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    pages: () => pages,
    renderThumbnail: async () => new Blob(),
  };
  const lay = (next: readonly ViewerLayoutPage[] | null) => {
    pages = next;
    listeners.forEach((listener) => listener());
  };
  return { layout, lay };
}

let made = 0;
const revoked: string[] = [];
const { createObjectURL, revokeObjectURL } = URL;

beforeEach(() => {
  made = 0;
  revoked.length = 0;
  URL.createObjectURL = () => `blob:thumb-${++made}`;
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});

afterEach(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

function thumbnailSources() {
  return screen
    .queryAllByRole("img")
    .map((img) => img.getAttribute("src"))
    .sort();
}

describe("ThumbnailSidebar", () => {
  it("redraws every thumbnail when the tool changes the pages, and when it hands them back", async () => {
    const { layout, lay } = changingLayout();
    render(
      <MantineProvider>
        <ThumbnailSidebar
          visible
          onToggle={() => undefined}
          pageLayout={layout}
        />
      </MantineProvider>,
    );
    await waitFor(() =>
      expect(thumbnailSources()).toEqual(["blob:thumb-1", "blob:thumb-2"]),
    );

    act(() => lay([page, page]));
    await waitFor(() =>
      expect(thumbnailSources()).toEqual(["blob:thumb-3", "blob:thumb-4"]),
    );
    expect(revoked.sort()).toEqual(["blob:thumb-1", "blob:thumb-2"]);

    act(() => lay(null));
    await waitFor(() =>
      expect(thumbnailSources()).toEqual(["blob:thumb-5", "blob:thumb-6"]),
    );
    expect(revoked.sort()).toEqual([
      "blob:thumb-1",
      "blob:thumb-2",
      "blob:thumb-3",
      "blob:thumb-4",
    ]);
  });
});
