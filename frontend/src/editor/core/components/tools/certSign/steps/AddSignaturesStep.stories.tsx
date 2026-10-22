import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddSignaturesStep } from "@app/components/tools/certSign/steps/AddSignaturesStep";

const meta = {
  title: "Tools/CertSign/Steps/AddSignaturesStep",
  component: AddSignaturesStep,
} satisfies Meta<typeof AddSignaturesStep>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onRequestPlacement: () => {},
    placementMode: false,
  },
};

export const PlacementMode: Story = {
  args: {
    onRequestPlacement: () => {},
    onCancelPlacement: () => {},
    placementMode: true,
  },
};

export const Disabled: Story = {
  args: {
    onRequestPlacement: () => {},
    placementMode: false,
    disabled: true,
  },
};
