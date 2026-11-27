import { useEffect, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { EditorContextMenu } from "@editor/tools/pdfTextEditor/components/EditorContextMenu";
import {
  editorContextMenu,
  type ContextMenuRequest,
} from "@editor/tools/pdfTextEditor/store/contextMenu";
import {
  MockPage,
  storyState,
  storyStore,
} from "@editor/tools/pdfTextEditor/components/editorStorySupport";

type Target =
  | "text"
  | "twoText"
  | "paragraph"
  | "image"
  | "page"
  | "table"
  | "locked";

/** The mock page element each story right-clicks, by test id. */
const ANCHOR: Record<Target, string> = {
  text: "pdf-editor-run-r2",
  twoText: "pdf-editor-run-r2",
  paragraph: "pdf-editor-run-r2",
  image: "pdf-editor-image-i1",
  page: "pdf-editor-run-r2",
  table: "pdf-editor-run-r2",
  locked: "pdf-editor-image-i1",
};

function requestFor(target: Target, x: number, y: number): ContextMenuRequest {
  const at = { pageIndex: 0, x: 300, y: 60 };
  switch (target) {
    case "text":
    case "twoText":
    case "paragraph":
    case "image":
      return { kind: "objects", clientX: x, clientY: y, at };
    case "page":
      return { kind: "page", clientX: x, clientY: y, at };
    case "table":
      return {
        kind: "page",
        clientX: x,
        clientY: y,
        at,
        table: { pageIndex: 0, tableId: "t1", row: 1, col: 1 },
      };
    case "locked":
      return {
        kind: "locked",
        clientX: x,
        clientY: y,
        pageIndex: 0,
        target: { imageId: "i1" },
      };
  }
}

/**
 * The editor's right-click menu, opened as a right-click on the mock page
 * would open it. Every target shares the same group order: clipboard,
 * Duplicate, what suits the target, then Unlock.
 */
function ContextMenuDemo({ target }: { target: Target }) {
  const store = useMemo(
    () =>
      storyStore(
        target === "text" || target === "paragraph"
          ? { runIds: ["r2"] }
          : target === "twoText"
            ? { runIds: ["r1", "r2"] }
            : target === "image"
              ? { imageIds: ["i1"] }
              : {},
      ),
    [target],
  );
  const state = storyState(store, {
    table: target === "table",
    lockedImage: target === "locked",
    paragraph: target === "paragraph",
  });

  useEffect(() => {
    const anchor = document
      .querySelector(`[data-testid="${ANCHOR[target]}"]`)
      ?.getBoundingClientRect();
    if (!anchor) return;
    editorContextMenu.open(
      requestFor(target, anchor.left + 40, anchor.top + anchor.height / 2),
    );
    return () => editorContextMenu.close();
  }, [target]);

  return (
    <MockPage>
      <EditorContextMenu
        store={store}
        state={state}
        selection={store.selection.value}
      />
    </MockPage>
  );
}

const meta: Meta<typeof ContextMenuDemo> = {
  title: "Text editor/Right-click menu",
  component: ContextMenuDemo,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Cut, Copy, Paste and Duplicate; formatting stays in the selection bar. */
export const Text: Story = { args: { target: "text" } };

/** Two text boxes: Group merges them into one paragraph. */
export const TwoTextBoxes: Story = {
  args: { target: "twoText" },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement.ownerDocument.body).findByTestId(
        "pdf-editor-context-group",
      ),
    ).toBeVisible();
  },
};

/** A paragraph of several lines: Ungroup splits it back into lines. */
export const Paragraph: Story = {
  args: { target: "paragraph" },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement.ownerDocument.body).findByTestId(
        "pdf-editor-context-ungroup",
      ),
    ).toBeVisible();
  },
};

/** Adds Save image and, where the browser allows, Edit in another app. */
export const Image: Story = { args: { target: "image" } };

/** Bare page: Paste and add text, a table or an image at the click. */
export const Page: Story = { args: { target: "page" } };

/** In a table cell: rows and columns are inserted or deleted at that cell. */
export const TableCell: Story = { args: { target: "table" } };

/** A locked object offers only Unlock. */
export const Locked: Story = { args: { target: "locked" } };
