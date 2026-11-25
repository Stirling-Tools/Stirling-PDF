import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { AnnotationVisibilityToggle } from "@editor/components/viewer/AnnotationVisibilityToggle";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";

const meta = {
  title: "Viewer/AnnotationVisibilityToggle",
  component: AnnotationVisibilityToggle,
  decorators: [
    (Story) => (
      <ViewerStoryProviders>
        <div style={{ padding: "3rem 16px 16px" }}>
          <Story />
        </div>
      </ViewerStoryProviders>
    ),
  ],
} satisfies Meta<typeof AnnotationVisibilityToggle>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Shown: Story = {};

/** Highlighted while the annotations are hidden. */
export const Hidden: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
};

export const Disabled: Story = { args: { disabled: true } };
