import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LastViewedPageBridge } from "@app/components/viewer/LastViewedPageBridge";
import {
  getLastViewedPage,
  setLastViewedPage,
  type LastViewedFile,
} from "@app/services/lastViewedPageStore";
import type { FileId } from "@app/types/file";

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

function file(fileId: string, quickKey: string): LastViewedFile {
  return { fileId: fileId as FileId, quickKey };
}

const FILE_A = file("a", "report.pdf|2048|1700000000000");
const FILE_A_REOPENED = file("a-reopened", FILE_A.quickKey);
const FILE_A_RENAMED = file("a", "final report.pdf|2048|1700000000000");
const FILE_A_V1 = file("a-v1", "report.pdf|1024|1600000000000");
const FILE_B = file("b", "notes.pdf|512|1700000000000");

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
    setLastViewedPage(FILE_A, 7);
    render(<LastViewedPageBridge file={FILE_A} restorePending={false} />);
    expect(fixture.scrollToPage).not.toHaveBeenCalled();

    layoutReady("first");

    expect(fixture.scrollToPage).toHaveBeenCalledExactlyOnceWith("first", 7);
  });

  it("restores a file reopened from disk, which arrives under a new FileId", () => {
    vi.useFakeTimers();
    const firstOpen = render(
      <LastViewedPageBridge file={FILE_A} restorePending={false} />,
    );
    layoutReady("first");
    pageChange("first", 8);
    firstOpen.unmount();

    fixture.activeDocumentId = "reopened";
    render(
      <LastViewedPageBridge file={FILE_A_REOPENED} restorePending={false} />,
    );
    layoutReady("reopened");

    expect(fixture.scrollToPage).toHaveBeenCalledExactlyOnceWith("reopened", 8);
  });

  it.each<
    [
      string,
      { totalPages?: number; pageNumber?: number; restorePending?: boolean },
    ]
  >([
    ["the page is past the end", { totalPages: 5 }],
    ["something already moved the document", { pageNumber: 3 }],
    ["a carried restore is in flight", { restorePending: true }],
  ])("leaves the position alone when %s", (_, overrides) => {
    setLastViewedPage(FILE_A, 7);
    render(
      <LastViewedPageBridge
        file={FILE_A}
        restorePending={overrides.restorePending ?? false}
      />,
    );

    layoutReady("first", overrides.totalPages, overrides.pageNumber);

    expect(fixture.scrollToPage).not.toHaveBeenCalled();
  });

  it("does not restore a replacement document", () => {
    const view = render(
      <LastViewedPageBridge file={FILE_A} restorePending={false} />,
    );
    layoutReady("first");

    setLastViewedPage(FILE_B, 4);
    fixture.activeDocumentId = "second";
    view.rerender(
      <LastViewedPageBridge file={FILE_B} restorePending={false} />,
    );
    layoutReady("second");

    expect(fixture.scrollToPage).not.toHaveBeenCalled();
  });

  it("saves the settled page once scrolling pauses", () => {
    vi.useFakeTimers();
    render(<LastViewedPageBridge file={FILE_A} restorePending={false} />);
    layoutReady("first");

    pageChange("first", 2);
    pageChange("other", 9);
    pageChange("first", 3);
    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();

    act(() => vi.advanceTimersByTime(500));
    expect(getLastViewedPage(FILE_A.quickKey)).toBe(3);
  });

  it("keeps the remembered page through page changes seen before the restore", () => {
    vi.useFakeTimers();
    setLastViewedPage(FILE_A, 6);
    render(<LastViewedPageBridge file={FILE_A} restorePending={false} />);

    pageChange("first", 1);
    act(() => vi.advanceTimersByTime(500));

    expect(getLastViewedPage(FILE_A.quickKey)).toBe(6);
  });

  it("leaves each version its own position when the viewer switches between them", () => {
    setLastViewedPage(FILE_A, 7);
    setLastViewedPage(FILE_A_V1, 3);
    const view = render(
      <LastViewedPageBridge file={FILE_A} restorePending={false} />,
    );
    layoutReady("first");

    fixture.activeDocumentId = "older";
    view.rerender(
      <LastViewedPageBridge file={FILE_A_V1} restorePending={false} />,
    );

    expect(getLastViewedPage(FILE_A.quickKey)).toBe(7);
    expect(getLastViewedPage(FILE_A_V1.quickKey)).toBe(3);
  });

  it("carries the position over when the same record takes a new key", () => {
    setLastViewedPage(FILE_A, 7);
    const view = render(
      <LastViewedPageBridge file={FILE_A} restorePending={false} />,
    );
    layoutReady("first");

    view.rerender(
      <LastViewedPageBridge file={FILE_A_RENAMED} restorePending={false} />,
    );

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
    expect(getLastViewedPage(FILE_A_RENAMED.quickKey)).toBe(7);
  });

  it("saves a pending page when the tab is closed", () => {
    vi.useFakeTimers();
    render(<LastViewedPageBridge file={FILE_A} restorePending={false} />);
    layoutReady("first");

    pageChange("first", 4);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(getLastViewedPage(FILE_A.quickKey)).toBe(4);
  });

  it("saves a pending page when the viewer closes", () => {
    vi.useFakeTimers();
    const view = render(
      <LastViewedPageBridge file={FILE_A} restorePending={false} />,
    );
    layoutReady("first");

    pageChange("first", 5);
    view.unmount();

    expect(getLastViewedPage(FILE_A.quickKey)).toBe(5);
  });
});
