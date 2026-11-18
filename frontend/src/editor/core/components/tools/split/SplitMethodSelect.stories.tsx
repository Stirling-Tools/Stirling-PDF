import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SplitMethodSelect from "@editor/components/tools/split/SplitMethodSelect";
import {
  METHOD_OPTIONS,
  SPLIT_METHODS,
  type SplitMethod,
} from "@editor/constants/splitConstants";

const meta = {
  title: "Tools/Split/SplitMethodSelect",
  component: SplitMethodSelect,
  parameters: { layout: "padded" },
  args: {
    options: METHOD_OPTIONS,
    value: null,
    onChange: () => {},
  },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "24rem" }}>
        <S />
      </div>
    ),
  ],
} satisfies Meta<typeof SplitMethodSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

function SplitMethodSelectDemo({ initial }: { initial: SplitMethod | null }) {
  const [value, setValue] = useState<SplitMethod | null>(initial);
  return (
    <SplitMethodSelect
      options={METHOD_OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

export const NoMethodSelected: Story = {
  render: () => <SplitMethodSelectDemo initial={null} />,
};

/** The selected method's one-line description sits behind the (i). */
export const MethodSelected: Story = {
  render: () => <SplitMethodSelectDemo initial={SPLIT_METHODS.BY_CHAPTERS} />,
};
