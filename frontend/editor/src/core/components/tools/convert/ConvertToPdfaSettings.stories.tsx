import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertToPdfaSettings from "@app/components/tools/convert/ConvertToPdfaSettings";
import { defaultParameters } from "@app/hooks/tools/convert/useConvertParameters";

const meta = {
  title: "Tools/Convert/ConvertToPdfaSettings",
  component: ConvertToPdfaSettings,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    selectedFiles: [],
    disabled: false,
  },
} satisfies Meta<typeof ConvertToPdfaSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const StrictMode: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      pdfaOptions: { outputFormat: "pdfa-1", strict: true },
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
