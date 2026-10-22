import type { Meta, StoryObj } from "@storybook/react-vite";
import AdvancedOCRSettings from "@app/components/tools/ocr/AdvancedOCRSettings";

const meta = {
  title: "Tools/Ocr/AdvancedOCRSettings",
  component: AdvancedOCRSettings,
} satisfies Meta<typeof AdvancedOCRSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    advancedOptions: [],
    ocrRenderType: "hocr",
    onParameterChange: () => {},
  },
};

export const OptionsSelected: Story = {
  args: {
    advancedOptions: ["sidecar", "deskew"],
    ocrRenderType: "hocr",
    onParameterChange: () => {},
  },
};

export const CompatibilityMode: Story = {
  args: {
    advancedOptions: [],
    ocrRenderType: "sandwich",
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    advancedOptions: ["clean"],
    ocrRenderType: "hocr",
    onParameterChange: () => {},
    disabled: true,
  },
};
