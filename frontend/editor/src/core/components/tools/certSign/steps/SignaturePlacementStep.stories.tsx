import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignaturePlacementStep } from "@app/components/tools/certSign/steps/SignaturePlacementStep";

const meta = {
  title: "Tools/CertSign/SignaturePlacementStep",
  component: SignaturePlacementStep,
} satisfies Meta<typeof SignaturePlacementStep>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isPlaced: false,
    placementInfo: null,
    onBack: () => {},
    onNext: () => {},
    children: (
      <div
        style={{ background: "var(--mantine-color-gray-1)", height: "100%" }}
      />
    ),
  },
};

export const Placed: Story = {
  args: {
    isPlaced: true,
    placementInfo: { page: 2, x: 120, y: 340 },
    onBack: () => {},
    onNext: () => {},
    children: (
      <div
        style={{ background: "var(--mantine-color-gray-1)", height: "100%" }}
      />
    ),
  },
};

export const Disabled: Story = {
  args: {
    isPlaced: true,
    placementInfo: { page: 1, x: 50, y: 50 },
    onBack: () => {},
    onNext: () => {},
    disabled: true,
    children: (
      <div
        style={{ background: "var(--mantine-color-gray-1)", height: "100%" }}
      />
    ),
  },
};
