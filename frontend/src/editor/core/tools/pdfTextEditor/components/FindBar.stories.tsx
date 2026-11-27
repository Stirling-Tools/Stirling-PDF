import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FindBar } from "@editor/tools/pdfTextEditor/components/FindBar";
import {
  MockPage,
  storyState,
  storyStore,
} from "@editor/tools/pdfTextEditor/components/editorStorySupport";

/** Find and replace, floating just above the viewer's bottom bar. */
function FindBarDemo() {
  const store = useMemo(() => storyStore(), []);
  return (
    <MockPage bottomBar>
      <FindBar
        store={store}
        pages={storyState(store).pages}
        onClose={() => {}}
      />
    </MockPage>
  );
}

const meta: Meta<typeof FindBarDemo> = {
  title: "Text editor/Find and replace",
  component: FindBarDemo,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
