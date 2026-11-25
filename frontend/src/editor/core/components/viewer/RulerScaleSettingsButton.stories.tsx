import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { RulerScaleSettingsButton } from "@editor/components/viewer/RulerScaleSettingsButton";

const meta = {
  title: "Viewer/RulerScaleSettingsButton",
  component: RulerScaleSettingsButton,
  args: { label: "Scale", tooltipPosition: "top" },
  decorators: [
    (Story) => (
      <div style={{ padding: "22rem 16px 16px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RulerScaleSettingsButton>;
export default meta;

type Story = StoryObj<typeof meta>;

export const NotSet: Story = {};

export const Ratio: Story = {
  args: { currentScale: { factor: 0.0352778, ratio: 100, unit: "m" } },
};

export const Unit: Story = {
  args: { currentScale: { factor: 0.0352778, ratio: null, unit: "cm" } },
};

export const Open: Story = {
  args: Ratio.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
};
