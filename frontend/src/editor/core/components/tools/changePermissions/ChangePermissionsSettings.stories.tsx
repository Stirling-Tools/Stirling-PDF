import type { Meta, StoryObj } from "@storybook/react-vite";
import ChangePermissionsSettings from "@editor/components/tools/changePermissions/ChangePermissionsSettings";
import { ChangePermissionsParameters } from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";

const mockParameters: ChangePermissionsParameters = {
  preventAssembly: false,
  preventExtractContent: false,
  preventExtractForAccessibility: false,
  preventFillInForm: false,
  preventModify: false,
  preventModifyAnnotations: false,
  preventPrinting: false,
  preventPrintingFaithful: false,
};

const meta: Meta<typeof ChangePermissionsSettings> = {
  title: "Tools/ChangePermissions/ChangePermissionsSettings",
  component: ChangePermissionsSettings,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: mockParameters,
    onParameterChange: () => {},
  },
};

export const SomeRestricted: Story = {
  args: {
    parameters: {
      ...mockParameters,
      preventPrinting: true,
      preventModify: true,
    },
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: mockParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
