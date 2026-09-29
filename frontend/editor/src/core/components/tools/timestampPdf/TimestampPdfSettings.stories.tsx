import type { Meta, StoryObj } from "@storybook/react-vite";
import TimestampPdfSettings from "@app/components/tools/timestampPdf/TimestampPdfSettings";
import { defaultParameters } from "@app/hooks/tools/timestampPdf/useTimestampPdfParameters";

const meta = {
  title: "Tools/TimestampPdf/TimestampPdfSettings",
  component: TimestampPdfSettings,
} satisfies Meta<typeof TimestampPdfSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
