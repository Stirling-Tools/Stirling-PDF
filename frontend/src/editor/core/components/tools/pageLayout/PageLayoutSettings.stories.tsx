import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import PageLayoutSettings from "@app/components/tools/pageLayout/PageLayoutSettings";
import {
  PageLayoutParameters,
  defaultParameters,
} from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

const meta: Meta<typeof PageLayoutSettings> = {
  title: "Tools/PageLayout/PageLayoutSettings",
  component: PageLayoutSettings,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PageLayoutSettings>;

function SettingsDemo({
  initial,
  disabled,
}: {
  initial: PageLayoutParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] = useState(initial);

  return (
    <PageLayoutSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

/** Default mode: pages-per-sheet select plus its description banner. */
export const Default: Story = {
  render: () => <SettingsDemo initial={defaultParameters} />,
};

/** Custom mode: rows/columns number inputs instead of the sheet-count select. */
export const CustomMode: Story = {
  render: () => (
    <SettingsDemo
      initial={{ ...defaultParameters, mode: "CUSTOM", rows: 2, cols: 3 }}
    />
  ),
};

/** Disabled: all controls locked, e.g. while no file is selected. */
export const Disabled: Story = {
  render: () => <SettingsDemo initial={defaultParameters} disabled />,
};
