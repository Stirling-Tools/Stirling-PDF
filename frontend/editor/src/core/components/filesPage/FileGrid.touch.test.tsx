import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render as baseRender } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FileGrid } from "@app/components/filesPage/FileGrid";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

vi.mock("@app/hooks/useIsMobile", () => ({
  useIsMobile: () => true,
  useIsPhone: () => true,
  useIsTouch: () => true,
}));
vi.mock("@app/components/shared/PolicyBadges", () => ({
  PolicyBadges: () => null,
}));

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

const stub = (id: string): StirlingFileStub => ({
  id: id as FileId,
  name: `${id}.pdf`,
  type: "application/pdf",
  size: 1_000,
  lastModified: 0,
  isLeaf: true,
  originalFileId: id,
  versionNumber: 1,
  thumbnailUrl: "data:image/svg+xml,%3Csvg/%3E",
});

function renderGrid(
  viewMode: "grid" | "list",
  selected: string[],
  handlers: { onSelectFile: () => void; onOpenFile: () => void },
) {
  const files = ["a", "b"].map(stub);
  const view = render(
    <FileContextProvider>
      <FileGrid
        entries={files.map((file) => ({ kind: "file" as const, file }))}
        viewMode={viewMode}
        selectedFileIds={new Set(selected as FileId[])}
        onOpenFolder={() => {}}
        {...handlers}
      />
    </FileContextProvider>,
  );
  const item = (i: number) =>
    view.container.querySelectorAll<HTMLElement>(
      viewMode === "grid"
        ? ".files-page-card:not(.is-folder)"
        : ".files-page-list-row:not(.is-header)",
    )[i];
  return { view, item };
}

describe.each(["grid", "list"] as const)(
  "FileGrid touch input (%s)",
  (mode) => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("opens a file on tap when nothing is selected", () => {
      const onOpenFile = vi.fn();
      const onSelectFile = vi.fn();
      const { item } = renderGrid(mode, [], { onOpenFile, onSelectFile });
      fireEvent.click(item(0));
      expect(onOpenFile).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a" }),
      );
      expect(onSelectFile).not.toHaveBeenCalled();
    });

    it("toggles a file on tap while a selection is in progress", () => {
      const onOpenFile = vi.fn();
      const onSelectFile = vi.fn();
      const { item } = renderGrid(mode, ["a"], { onOpenFile, onSelectFile });
      fireEvent.click(item(1));
      expect(onSelectFile).toHaveBeenCalledWith("b", false, true);
      expect(onOpenFile).not.toHaveBeenCalled();
    });

    it("shows checkboxes from the first selected file", () => {
      const { view } = renderGrid(mode, ["a"], {
        onOpenFile: () => {},
        onSelectFile: () => {},
      });
      const rowCheckboxes = view.container.querySelectorAll(
        mode === "grid"
          ? ".files-page-card input[type=checkbox]"
          : ".files-page-list-row:not(.is-header) input[type=checkbox]",
      );
      expect(rowCheckboxes).toHaveLength(2);
    });

    it("selects on long press and swallows the click that follows", () => {
      const onOpenFile = vi.fn();
      const onSelectFile = vi.fn();
      const { item } = renderGrid(mode, [], { onOpenFile, onSelectFile });
      fireEvent.pointerDown(item(0), {
        pointerType: "touch",
        clientX: 5,
        clientY: 5,
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onSelectFile).toHaveBeenCalledWith("a", false, true);
      fireEvent.pointerUp(item(0), { pointerType: "touch" });
      fireEvent.click(item(0));
      expect(onOpenFile).not.toHaveBeenCalled();
      expect(onSelectFile).toHaveBeenCalledTimes(1);
    });

    it("does not select when the finger moves to scroll", () => {
      const onSelectFile = vi.fn();
      const { item } = renderGrid(mode, [], {
        onOpenFile: () => {},
        onSelectFile,
      });
      fireEvent.pointerDown(item(0), {
        pointerType: "touch",
        clientX: 5,
        clientY: 5,
      });
      fireEvent.pointerMove(item(0), {
        pointerType: "touch",
        clientX: 5,
        clientY: 40,
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onSelectFile).not.toHaveBeenCalled();
    });
  },
);
