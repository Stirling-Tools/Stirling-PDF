import type { Meta, StoryObj } from "@storybook/react-vite";
import AdjustContrastPreview from "@app/components/tools/adjustContrast/AdjustContrastPreview";
import { defaultParameters } from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";

const meta = {
  title: "Tools/AdjustContrast/AdjustContrastPreview",
  component: AdjustContrastPreview,
} satisfies Meta<typeof AdjustContrastPreview>;
export default meta;

type Story = StoryObj<typeof meta>;

// No file selected yet: the component shows the obscured "select a PDF" state
// without attempting any thumbnail generation, which needs a live PDF worker.
export const Default: Story = {
  args: {
    file: null,
    parameters: defaultParameters,
  },
};
