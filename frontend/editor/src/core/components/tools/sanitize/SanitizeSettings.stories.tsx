import type { Meta, StoryObj } from "@storybook/react-vite";
import SanitizeSettings from "@app/components/tools/sanitize/SanitizeSettings";
import { defaultParameters } from "@app/hooks/tools/sanitize/useSanitizeParameters";

const meta = {
  title: "Tools/Sanitize/SanitizeSettings",
  component: SanitizeSettings,
} satisfies Meta<typeof SanitizeSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const AllSelected: Story = {
  args: {
    parameters: {
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: true,
      removeMetadata: true,
      removeLinks: true,
      removeFonts: true,
    },
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
