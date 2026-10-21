import type { Meta, StoryObj } from "@storybook/react-vite";
import ScannerImageSplitSettings from "@app/components/tools/scannerImageSplit/ScannerImageSplitSettings";
import { ScannerImageSplitParameters } from "@app/hooks/tools/scannerImageSplit/useScannerImageSplitParameters";

const buildParameters = (
  overrides: Partial<ScannerImageSplitParameters> = {},
): ScannerImageSplitParameters => ({
  angle_threshold: 10,
  tolerance: 30,
  min_area: 10000,
  min_contour_area: 500,
  border_size: 1,
  ...overrides,
});

const meta = {
  title: "Tools/ScannerImageSplit/ScannerImageSplitSettings",
  component: ScannerImageSplitSettings,
} satisfies Meta<typeof ScannerImageSplitSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
    disabled: true,
  },
};
