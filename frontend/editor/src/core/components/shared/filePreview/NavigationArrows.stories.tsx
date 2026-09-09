import type { Meta, StoryObj } from "@storybook/react-vite";
import NavigationArrows from "@app/components/shared/filePreview/NavigationArrows";

const meta = {
  title: "Shared/FilePreview/NavigationArrows",
  component: NavigationArrows,
  parameters: { layout: "padded" },
  args: {
    onPrevious: () => {},
    onNext: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: "20rem", height: "12rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NavigationArrows>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <div>Page 1 of 5</div>,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: <div>Page 1 of 1</div>,
  },
};
