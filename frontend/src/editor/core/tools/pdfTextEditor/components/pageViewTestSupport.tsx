import type { ComponentProps } from "react";
import { MantineProvider } from "@mantine/core";
import { PageView } from "@editor/tools/pdfTextEditor/components/PageView";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  PageSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";

// Fixtures shared by the PageView tests. The mocks stay in the test files:
// vi.mock is hoisted per file, so a helper cannot own them.

/** Reports every observed page as on screen at once, so PageView paints it. */
export class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect(): void {}
  unobserve(): void {}
}

export function pageSnapshot(
  live: Page,
  runs: TextRunSnapshot[] = [],
): PageSnapshot {
  return {
    pageIndex: 0,
    width: live.width,
    height: live.height,
    dirty: false,
    revision: live.revision,
    runs,
    images: [],
    shapes: [],
    display: live.display.toData(),
  };
}

/** A document that hands out `live` for every page. Keep one per test: PageView repaints when it changes. */
export function stubDocument(live: Page): EditorDocument {
  return { page: () => live } as unknown as EditorDocument;
}

const STUB_STORE = {
  setPageNearViewport: () => {},
} as unknown as EditorStore;

/** PageView over `page` at scale 1 in Grow, with nothing selected and no-op handlers. */
export function stubbedPageView(
  document: EditorDocument,
  page: PageSnapshot,
  props: Partial<ComponentProps<typeof PageView>> = {},
) {
  return (
    <MantineProvider env="test">
      <PageView
        document={document}
        store={STUB_STORE}
        page={page}
        scale={1}
        widthMode="grow"
        selectedRunIds={[]}
        selectedImageIds={[]}
        selectedShapeIds={[]}
        onSelectRun={() => {}}
        onSelectImage={() => {}}
        onSelectShape={() => {}}
        onEditRun={() => {}}
        {...props}
      />
    </MantineProvider>
  );
}
