import type { Meta, StoryObj } from "@storybook/react-vite";
import OCRSettings from "@app/components/tools/ocr/OCRSettings";
import { OCRParameters } from "@app/hooks/tools/ocr/useOCRParameters";

const buildParameters = (
  overrides: Partial<OCRParameters> = {},
): OCRParameters => ({
  languages: [],
  ocrType: "skip-text",
  ocrRenderType: "hocr",
  additionalOptions: [],
  ...overrides,
});

const meta = {
  title: "Tools/OCR/OCRSettings",
  component: OCRSettings,
} satisfies Meta<typeof OCRSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
  },
};

export const LanguagesSelected: Story = {
  args: {
    parameters: buildParameters({ languages: ["eng", "fra"] }),
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
