import type { Meta, StoryObj } from "@storybook/react-vite";
import RemoveBlanksSettings from "@app/components/tools/removeBlanks/RemoveBlanksSettings";
import { RemoveBlanksParameters } from "@app/hooks/tools/removeBlanks/useRemoveBlanksParameters";

const buildParameters = (
  overrides: Partial<RemoveBlanksParameters> = {},
): RemoveBlanksParameters => ({
  threshold: 10,
  whitePercent: 99.9,
  includeBlankPages: false,
  ...overrides,
});

const meta = {
  title: "Tools/RemoveBlanks/RemoveBlanksSettings",
  component: RemoveBlanksSettings,
} satisfies Meta<typeof RemoveBlanksSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
  },
};

export const IncludeBlankPages: Story = {
  args: {
    parameters: buildParameters({ includeBlankPages: true }),
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
