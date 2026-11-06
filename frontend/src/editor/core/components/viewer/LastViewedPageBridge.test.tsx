import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LastViewedPageBridge } from "@editor/components/viewer/LastViewedPageBridge";
import {
  readViewedPage,
  resumeWorkbenchSession,
  writeViewedPage,
} from "@editor/services/workbenchSession";

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
  sessionStorage.clear();
  resumeWorkbenchSession();
  fixture.scrollToPage.mockClear();
});

describe("LastViewedPageBridge", () => {
  it("reopens a file at its remembered page once its layout is ready", () => {
    writeViewedPage("a", 7);
    render(<LastViewedPageBridge originalFileId="a" restorePending={false} />);
    expect(fixture.scrollToPage).not.toHaveBeenCalled();

    layoutReady("doc");

    expect(fixture.scrollToPage).toHaveBeenCalledExactlyOnceWith("doc", 7);
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
    writeViewedPage("a", 7);
    render(
      <LastViewedPageBridge
        originalFileId="a"
        restorePending={overrides.restorePending ?? false}
      />,
    );

    layoutReady("doc", overrides.totalPages, overrides.pageNumber);

    expect(fixture.scrollToPage).not.toHaveBeenCalled();
  });

  it("does not restore a new version replacing the first document", () => {
    render(<LastViewedPageBridge originalFileId="a" restorePending={false} />);
    layoutReady("v1");
    writeViewedPage("a", 4);

    layoutReady("v2");

    expect(fixture.scrollToPage).not.toHaveBeenCalled();
  });

  it("records the page once the restore has run", () => {
    writeViewedPage("a", 6);
    render(<LastViewedPageBridge originalFileId="a" restorePending={false} />);

    pageChange("doc", 1);
    expect(readViewedPage("a")).toBe(6);

    layoutReady("doc");
    pageChange("doc", 3);
    expect(readViewedPage("a")).toBe(3);
  });

  it("remembers nothing for a file without an original id", () => {
    render(
      <LastViewedPageBridge originalFileId={null} restorePending={false} />,
    );
    layoutReady("doc");
    pageChange("doc", 3);

    expect(sessionStorage.length).toBe(0);
  });
});
