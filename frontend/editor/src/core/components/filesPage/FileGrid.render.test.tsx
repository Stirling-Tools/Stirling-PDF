import { describe, it, expect, vi } from "vitest";
import { render as baseRender } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

/**
 * The grid's items are memoized so a selection click re-renders the cards whose
 * selection changed rather than the whole folder. That only holds while every prop
 * they take stays stable - one inline object or closure at a call site silently
 * undoes it, with no visible symptom until a folder is large. These count renders
 * so that regression fails here instead of in someone's 500-file folder.
 */

// @app/ui wraps Mantine, so the provider has to be in the tree.
const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });
// Every card renders this exactly once, so its calls are a per-card render count.
const badgeRenders: { n: number } = { n: 0 };
vi.mock("@app/components/shared/PolicyBadges", () => ({
  PolicyBadges: () => {
    badgeRenders.n += 1;
    return null;
  },
}));
const buildStub = (id: string, name: string): StirlingFileStub =>
  ({
    id: id as FileId,
    name,
    type: "application/pdf",
    size: 1_000,
    lastModified: 0,
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
    // Set so useLazyThumbnail short-circuits instead of reading IndexedDB.
    thumbnailUrl: "data:image/svg+xml,%3Csvg/%3E",
  }) as StirlingFileStub;

describe("FileGrid item memoization", () => {
  it("re-renders only the cards whose selection changed", async () => {
    const { FileGrid } = await import("@app/components/filesPage/FileGrid");
    const { FileContextProvider } = await import("@app/contexts/FileContext");

    const files = ["a", "b", "c", "d"].map((id) => buildStub(id, `${id}.pdf`));
    const entries = files.map((file) => ({ kind: "file" as const, file }));

    const props = {
      entries,
      viewMode: "grid" as const,
      onSelectFile: () => {},
      onOpenFolder: () => {},
      onOpenFile: () => {},
      onMoveFiles: () => {},
      onMoveFolder: () => {},
      onRenameFolder: () => {},
      onDeleteFolder: () => {},
      onChangeFolderAppearance: () => {},
      onRemoveFiles: () => {},
      onPromptMoveFiles: () => {},
    };

    const view = render(
      <FileContextProvider>
        <FileGrid {...props} selectedFileIds={new Set<FileId>()} />
      </FileContextProvider>,
    );
    const cards = () =>
      view.container.querySelectorAll(".files-page-card:not(.is-folder)");
    expect(cards()).toHaveLength(4);
    const initialRenders = badgeRenders.n;
    expect(initialRenders).toBeGreaterThanOrEqual(4);

    // Selecting one file changes isSelected for exactly one card. The rest take
    // identical props, so memo should skip them.
    view.rerender(
      <FileContextProvider>
        <FileGrid
          {...props}
          selectedFileIds={new Set<FileId>(["a" as FileId])}
        />
      </FileContextProvider>,
    );
    expect(cards()).toHaveLength(4);
    expect(
      view.container.querySelectorAll(".files-page-card.is-selected"),
    ).toHaveLength(1);

    // The point of the exercise: one card changed, so the re-render count moves by
    // one card's worth and not four. Unmemoized items redraw the whole folder here.
    const rerendered = badgeRenders.n - initialRenders;
    const perCard = initialRenders / 4;
    expect(rerendered).toBe(perCard);
  });
});
