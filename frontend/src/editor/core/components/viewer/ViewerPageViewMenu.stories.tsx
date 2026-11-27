import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ViewerPageViewMenu } from "@editor/components/viewer/ViewerPageViewMenu";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";

const meta = {
  title: "Viewer/ViewerPageViewMenu",
  component: ViewerPageViewMenu,
  decorators: [
    (Story) => (
      <ViewerStoryProviders>
        <div style={{ padding: 16, minHeight: "26rem" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
} satisfies Meta<typeof ViewerPageViewMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

/** Layout, default zoom and page colour, open as a user sees it. */
export const Open: Story = {
  parameters: {
    // Mantine puts a focus placeholder div inside every open menu.
    a11y: {
      config: { rules: [{ id: "aria-required-children", enabled: false }] },
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
};

export const Disabled: Story = { args: { disabled: true } };
