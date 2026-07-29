import type { Meta, StoryObj } from "@storybook/react-vite";
import DragOverlay from "@app/components/fileManager/DragOverlay";

const meta = {
  title: "FileManager/DragOverlay",
  component: DragOverlay,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DragOverlay>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isVisible: true,
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "20rem" }}>
        <Story />
      </div>
    ),
  ],
};

export const Hidden: Story = {
  args: {
    isVisible: false,
  },
};
