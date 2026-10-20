import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import React, { useState } from "react";
import {
  ViewerProvider,
  useViewer,
  type ViewerContextType,
} from "@app/contexts/ViewerContext";

vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigation: () => ({ currentRoute: "/" }),
}));

const mockFile = Object.assign(new File(["%PDF"], "sample.pdf"), {
  fileId: "file-1",
  quickKey: "quick-1",
});
const mockSelectors = { getFiles: () => [mockFile] };
vi.mock("@app/contexts/FileContext", () => ({
  useFileSelectors: () => mockSelectors,
  // The workbench id list the provider watches when pruning activeFileId.
  useFileSelector: () => [mockFile.fileId],
  useFileIndex: () => -1,
}));

vi.mock("@app/services/policyExport", () => ({
  enforceExportPolicies: vi.fn(),
}));

const MemoizedProbe = React.memo(function ContextProbe({
  onRead,
}: {
  onRead: (ctx: ViewerContextType) => void;
}) {
  const ctx = useViewer();
  onRead(ctx);
  return (
    <>
      <button
        onClick={() => ctx.toggleThumbnailSidebar()}
        data-testid="toggle-sidebar"
      >
        Toggle
      </button>
      <button
        onClick={() => ctx.setActiveFileIndex(0)}
        data-testid="set-active-file"
      >
        Set active file
      </button>
    </>
  );
});

function ParentHarness({
  onRead,
}: {
  onRead: (ctx: ViewerContextType) => void;
}) {
  const [, setTick] = useState(0);
  return (
    <div>
      <button
        onClick={() => setTick((t) => t + 1)}
        data-testid="rerender-parent"
      >
        Rerender Parent
      </button>
      <ViewerProvider>
        <MemoizedProbe onRead={onRead} />
      </ViewerProvider>
    </div>
  );
}

describe("ViewerContext stability", () => {
  it("skips consumer re-renders when parent re-renders due to context value memoization", () => {
    let renderCount = 0;
    let latestCtx: ViewerContextType | null = null;

    const { getByTestId } = render(
      <ParentHarness
        onRead={(ctx) => {
          renderCount++;
          latestCtx = ctx;
        }}
      />,
    );

    expect(renderCount).toBe(1);
    const firstCtx = latestCtx;

    act(() => {
      getByTestId("rerender-parent").click();
    });

    expect(renderCount).toBe(1);
    expect(latestCtx).toBe(firstCtx);
  });

  it("preserves identity of actions, getters, and toggle callbacks across internal state transitions", () => {
    let renderCount = 0;
    const recordedContexts: ViewerContextType[] = [];

    const { getByTestId } = render(
      <ViewerProvider>
        <MemoizedProbe
          onRead={(ctx) => {
            renderCount++;
            recordedContexts.push(ctx);
          }}
        />
      </ViewerProvider>,
    );

    expect(renderCount).toBe(1);
    const first = recordedContexts[0];

    act(() => {
      getByTestId("toggle-sidebar").click();
    });

    expect(renderCount).toBe(2);
    const second = recordedContexts[1];

    expect(first.isThumbnailSidebarVisible).toBe(false);
    expect(second.isThumbnailSidebarVisible).toBe(true);

    expect(second.scrollActions).toBe(first.scrollActions);
    expect(second.zoomActions).toBe(first.zoomActions);
    expect(second.panActions).toBe(first.panActions);
    expect(second.selectionActions).toBe(first.selectionActions);
    expect(second.spreadActions).toBe(first.spreadActions);
    expect(second.rotationActions).toBe(first.rotationActions);
    expect(second.searchActions).toBe(first.searchActions);
    expect(second.exportActions).toBe(first.exportActions);
    expect(second.bookmarkActions).toBe(first.bookmarkActions);
    expect(second.attachmentActions).toBe(first.attachmentActions);
    expect(second.printActions).toBe(first.printActions);
    expect(second.searchInterfaceActions).toBe(first.searchInterfaceActions);

    expect(second.getScrollState).toBe(first.getScrollState);
    expect(second.getZoomState).toBe(first.getZoomState);
    expect(second.getBookmarkState).toBe(first.getBookmarkState);
    expect(second.toggleThumbnailSidebar).toBe(first.toggleThumbnailSidebar);
    expect(second.toggleBookmarkSidebar).toBe(first.toggleBookmarkSidebar);
    expect(second.toggleAttachmentSidebar).toBe(first.toggleAttachmentSidebar);
    expect(second.toggleLayerSidebar).toBe(first.toggleLayerSidebar);
  });

  it("keeps print actions identical when the active file changes", () => {
    const recordedContexts: ViewerContextType[] = [];

    const { getByTestId } = render(
      <ViewerProvider>
        <MemoizedProbe onRead={(ctx) => recordedContexts.push(ctx)} />
      </ViewerProvider>,
    );

    const first = recordedContexts[0];
    expect(first.activeFileId).toBeNull();

    act(() => {
      getByTestId("set-active-file").click();
    });

    const latest = recordedContexts[recordedContexts.length - 1];
    expect(latest.activeFileId).toBe("file-1");
    expect(latest.printActions).toBe(first.printActions);
  });
});
