import type { Meta, StoryObj } from "@storybook/react-vite";
import ExtractPagesSettings from "@app/components/tools/extractPages/ExtractPagesSettings";
import { ExtractPagesParameters } from "@app/hooks/tools/extractPages/useExtractPagesParameters";

const meta = {
  title: "Tools/ExtractPages/ExtractPagesSettings",
  component: ExtractPagesSettings,
} satisfies Meta<typeof ExtractPagesSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

const buildParameters = (
  overrides: Partial<ExtractPagesParameters> = {},
): ExtractPagesParameters => ({
  pageNumbers: "",
  ...overrides,
});

export const Default: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
  },
};

export const Filled: Story = {
  args: {
    parameters: buildParameters({ pageNumbers: "1,3,5-8" }),
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: buildParameters({ pageNumbers: "1-10" }),
    onParameterChange: () => {},
    disabled: true,
  },
};
