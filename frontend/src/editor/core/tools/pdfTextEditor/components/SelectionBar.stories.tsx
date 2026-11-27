import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { SelectionBar } from "@editor/tools/pdfTextEditor/components/SelectionBar";
import {
  MockPage,
  storyState,
  storyStore,
} from "@editor/tools/pdfTextEditor/components/editorStorySupport";

/**
 * The bar floats above whatever is selected (below it when there is no room)
 * and carries only the tools that apply: text formatting for text, image
 * tools for images, then duplicate, lock, delete and arrange.
 */
function SelectionBarDemo({
  runIds = [],
  imageIds = [],
}: {
  runIds?: string[];
  imageIds?: string[];
}) {
  const store = useMemo(
    () => storyStore({ runIds, imageIds }),
    [runIds, imageIds],
  );
  return (
    <MockPage>
      <SelectionBar
        store={store}
        state={storyState(store)}
        selection={store.selection.value}
      />
    </MockPage>
  );
}

const meta: Meta<typeof SelectionBarDemo> = {
  title: "Text editor/Selection bar",
  component: SelectionBarDemo,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Font and colour open as menus from the icon and the swatch. */
export const Text: Story = { args: { runIds: ["r1"] } };

/** Rotate, flip and replace in place of the text controls. */
export const Image: Story = { args: { imageIds: ["i1"] } };

/** Several objects: no Duplicate, and Arrange can align them. */
export const MultipleObjects: Story = {
  args: { runIds: ["r1", "r2"], imageIds: ["i1"] },
};

/** Position and size open from the bar, in points, for one selected object. */
export const PositionAndSize: Story = {
  args: { runIds: ["r1"] },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByTestId(
        "pdf-editor-geometry-menu",
      ),
    );
  },
};
