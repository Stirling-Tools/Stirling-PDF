import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LastViewedPageBridge } from "@app/components/viewer/LastViewedPageBridge";
import {
  getLastViewedPage,
  setLastViewedPage,
} from "@app/services/lastViewedPageStore";

const fixture = vi.hoisted(() => {
  const emitter = <T,>() => {
    const listeners = new Set<(value: T) => void>();
    return {
      on: (listener: (value: T) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      emit: (value: T) => {
        for (const listener of [...listeners]) listener(value);
      },
    };
  };
  const layoutReady = emitter<{
    documentId: string;
    pageNumber: number;
    totalPages: number;
  }>();
  const pageChange = emitter<{ documentId: string; pageNumber: number }>();
  const scrollToPage = vi.fn();
  return {
    activeDocumentId: "first",
    layoutReady,
    pageChange,
    scrollToPage,
    scroll: {
      onLayoutReady: layoutReady.on,
      onPageChange: pageChange.on,
      forDocument: (documentId: string) => ({
        scrollToPage: (options: { pageNumber: number }) =>
          scrollToPage(documentId, options.pageNumber),
      }),
    },
  };
});

vi.mock("@app/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => fixture.activeDocumentId,
  useDocumentReady: () => true,
}));
vi.mock("@embedpdf/plugin-scroll/react", () => ({
  useScrollCapability: () => ({ provides: fixture.scroll }),
}));

function layoutReady(documentId: string, totalPages = 10, pageNumber = 1) {
  act(() => fixture.layoutReady.emit({ documentId, pageNumber, totalPages }));
}

function pageChange(documentId: string, pageNumber: number) {
  act(() => fixture.pageChange.emit({ documentId, pageNumber }));
}

beforeEach(() => {
  localStorage.clear();
  fixture.activeDocumentId = "first";
  fixture.scrollToPage.mockClear();
});

afterEach(() => vi.useRealTimers());

describe("LastViewedPageBridge", () => {
  it("reopens a file at its remembered page once its layout is ready", () => {
    setLastViewedPage("file-a", 7);
    render(<LastViewedPageBridge fileId="file-a" restorePending={false} />);
    expect(fixture.scrollToPage).not.toHaveBeenCalled();

    layoutReady("first");

    expect(fixture.scrollToPage).toHaveBeenCalledExactlyOnceWith("first", 7);
  });

  it.each([
    ["the page is past the end", { totalPages: 5 }],
    ["something already moved the document", { pageNumber: 3 }],
    ["a carried restore is in flight", { restorePending: true }],
  ])("leaves the position alone when %s", (_, overrides) => {
    setLastViewedPage("file-a", 7);
    render(
      <LastViewedPageBridge
        fileId="file-a"
        restorePending={overrides.restorePending ?? false}
      />,
    );

    layoutReady("first", overrides.totalPages, overrides.pageNumber);

    expect(fixture.scrollToPage).not.toHaveBeenCalled();
  });

  it("does not restore a replacement document", () => {
    const view = render(
      <LastViewedPageBridge fileId="file-a" restorePending={false} />,
    );
    layoutReady("first");

    setLastViewedPage("file-b", 4);
    fixture.activeDocumentId = "second";
    view.rerender(
      <LastViewedPageBridge fileId="file-b" restorePending={false} />,
    );
    layoutReady("second");

    expect(fixture.scrollToPage).not.toHaveBeenCalled();
  });

  it("saves the settled page once scrolling pauses", () => {
    vi.useFakeTimers();
    render(<LastViewedPageBridge fileId="file-a" restorePending={false} />);
    layoutReady("first");

    pageChange("first", 2);
    pageChange("other", 9);
    pageChange("first", 3);
    expect(getLastViewedPage("file-a")).toBeNull();

    act(() => vi.advanceTimersByTime(500));
    expect(getLastViewedPage("file-a")).toBe(3);
  });

  it("keeps the remembered page through page changes seen before the restore", () => {
    vi.useFakeTimers();
    setLastViewedPage("file-a", 6);
    render(<LastViewedPageBridge fileId="file-a" restorePending={false} />);

    pageChange("first", 1);
    act(() => vi.advanceTimersByTime(500));

    expect(getLastViewedPage("file-a")).toBe(6);
  });

  it("saves a pending page when the viewer closes", () => {
    vi.useFakeTimers();
    const view = render(
      <LastViewedPageBridge fileId="file-a" restorePending={false} />,
    );
    layoutReady("first");

    pageChange("first", 5);
    view.unmount();

    expect(getLastViewedPage("file-a")).toBe(5);
  });
});
