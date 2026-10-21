import type { Meta, StoryObj } from "@storybook/react-vite";
import UnlockPdfFormsSettings from "@app/components/tools/unlockPdfForms/UnlockPdfFormsSettings";
import { UnlockPdfFormsParameters } from "@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters";

const defaultParameters: UnlockPdfFormsParameters = {};

const meta = {
  title: "Tools/UnlockPdfForms/UnlockPdfFormsSettings",
  component: UnlockPdfFormsSettings,
} satisfies Meta<typeof UnlockPdfFormsSettings>;
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
