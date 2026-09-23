import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import PageLayoutAdvancedSettings from "@app/components/tools/pageLayout/PageLayoutAdvancedSettings";
import {
  PageLayoutParameters,
  defaultParameters,
} from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

const meta = {
  title: "Tools/PageLayout/PageLayoutAdvancedSettings",
  component: PageLayoutAdvancedSettings,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof PageLayoutAdvancedSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function AdvancedSettingsDemo({
  disabled,
  initialParameters,
}: {
  disabled?: boolean;
  initialParameters?: PageLayoutParameters;
}) {
  const [parameters, setParameters] = useState<PageLayoutParameters>(
    initialParameters ?? defaultParameters,
  );
  return (
    <PageLayoutAdvancedSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <AdvancedSettingsDemo />,
};

export const Disabled: Story = {
  render: () => <AdvancedSettingsDemo disabled />,
};

export const LandscapeRTL: Story = {
  render: () => (
    <AdvancedSettingsDemo
      initialParameters={{
        ...defaultParameters,
        orientation: "LANDSCAPE",
        arrangement: "BY_ROWS",
        readingDirection: "RTL",
      }}
    />
  ),
};
