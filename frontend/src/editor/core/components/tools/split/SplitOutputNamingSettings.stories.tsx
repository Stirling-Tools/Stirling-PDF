import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SplitOutputNamingSettings from "@editor/components/tools/split/SplitOutputNamingSettings";
import { SPLIT_METHODS } from "@editor/constants/splitConstants";
import {
  defaultParameters,
  SplitParameters,
} from "@editor/hooks/tools/split/useSplitParameters";

const meta = {
  title: "Tools/Split/SplitOutputNamingSettings",
  component: SplitOutputNamingSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "24rem" }}>
        <S />
      </div>
    ),
  ],
} satisfies Meta<typeof SplitOutputNamingSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function NamingDemo({ initial }: { initial: Partial<SplitParameters> }) {
  const [parameters, setParameters] = useState<SplitParameters>({
    ...defaultParameters,
    method: SPLIT_METHODS.BY_CHAPTERS,
    ...initial,
  });

  return (
    <SplitOutputNamingSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
    />
  );
}

/** Nothing chosen: each method keeps its own default names. */
export const DefaultNames: Story = {
  render: () => <NamingDemo initial={{}} />,
};

/** A custom pattern with its live preview. */
export const CustomPattern: Story = {
  render: () => (
    <NamingDemo
      initial={{ outputNaming: "custom", outputNamePattern: "Invoice {n}" }}
    />
  ),
};

/** One name per line; the blank line keeps file 2's default name. */
export const TypeEachName: Story = {
  render: () => (
    <NamingDemo
      initial={{ outputNaming: "list", outputNames: "Cover\n\nAppendix" }}
    />
  ),
};
