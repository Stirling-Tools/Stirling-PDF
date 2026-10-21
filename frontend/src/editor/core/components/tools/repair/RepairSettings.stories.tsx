import type { Meta, StoryObj } from "@storybook/react-vite";
import RepairSettings from "@app/components/tools/repair/RepairSettings";
import { RepairParameters } from "@app/hooks/tools/repair/useRepairParameters";

const parameters: RepairParameters = {};

const meta = {
  title: "Tools/Repair/RepairSettings",
  component: RepairSettings,
  args: {
    parameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof RepairSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
