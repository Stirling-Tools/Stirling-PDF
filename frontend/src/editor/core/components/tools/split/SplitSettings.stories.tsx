import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SplitSettings from "@app/components/tools/split/SplitSettings";
import { SPLIT_METHODS } from "@app/constants/splitConstants";
import {
  defaultParameters,
  SplitParameters,
} from "@app/hooks/tools/split/useSplitParameters";

const meta = {
  title: "Tools/Split/SplitSettings",
  component: SplitSettings,
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
} satisfies Meta<typeof SplitSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function SplitSettingsDemo({
  initialParameters,
  disabled,
}: {
  initialParameters: SplitParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] =
    useState<SplitParameters>(initialParameters);

  return (
    <SplitSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

/** No method chosen yet — shows the "select a method first" placeholder. */
export const NoMethodSelected: Story = {
  render: () => <SplitSettingsDemo initialParameters={defaultParameters} />,
};

/** Split by pages: a single page-range text input. */
export const ByPages: Story = {
  render: () => (
    <SplitSettingsDemo
      initialParameters={{
        ...defaultParameters,
        method: SPLIT_METHODS.BY_PAGES,
        pages: "1,3,5-10",
      }}
    />
  ),
};

/** Split by sections: divisions, split mode, and merge checkbox. */
export const BySections: Story = {
  render: () => (
    <SplitSettingsDemo
      initialParameters={{
        ...defaultParameters,
        method: SPLIT_METHODS.BY_SECTIONS,
      }}
    />
  ),
};

/** Split by poster print: page size + division factors + orientation. */
export const ByPoster: Story = {
  render: () => (
    <SplitSettingsDemo
      initialParameters={{
        ...defaultParameters,
        method: SPLIT_METHODS.BY_POSTER,
      }}
    />
  ),
};

/** Disabled state: all inputs are non-interactive. */
export const Disabled: Story = {
  render: () => (
    <SplitSettingsDemo
      initialParameters={{
        ...defaultParameters,
        method: SPLIT_METHODS.BY_PAGES,
        pages: "1,3,5-10",
      }}
      disabled
    />
  ),
};
