import type { Meta, StoryObj } from "@storybook/react-vite";
import FlattenSettings from "@app/components/tools/flatten/FlattenSettings";
import { FlattenParameters } from "@app/hooks/tools/flatten/useFlattenParameters";

const buildParameters = (
  overrides: Partial<FlattenParameters> = {},
): FlattenParameters => ({
  flattenOnlyForms: false,
  renderDpi: undefined,
  ...overrides,
});

const meta = {
  title: "Tools/Flatten/FlattenSettings",
  component: FlattenSettings,
} satisfies Meta<typeof FlattenSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: buildParameters(),
    onParameterChange: () => {},
  },
};

export const FlattenOnlyForms: Story = {
  args: {
    parameters: buildParameters({ flattenOnlyForms: true }),
    onParameterChange: () => {},
  },
};

export const CustomRenderDpi: Story = {
  args: {
    parameters: buildParameters({ renderDpi: 300 }),
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
