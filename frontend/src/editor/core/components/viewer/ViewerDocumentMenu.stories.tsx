import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ViewerDocumentMenu } from "@editor/components/viewer/ViewerDocumentMenu";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";

const meta = {
  title: "Viewer/ViewerDocumentMenu",
  component: ViewerDocumentMenu,
  decorators: [
    (Story) => (
      <ViewerStoryProviders>
        <div style={{ padding: 16, minHeight: "26rem" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
} satisfies Meta<typeof ViewerDocumentMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

/** With no document open, the document's own actions are unavailable. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
  parameters: {
    // Mantine puts a focus placeholder div inside every open menu.
    a11y: {
      config: { rules: [{ id: "aria-required-children", enabled: false }] },
    },
  },
};
