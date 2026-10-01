import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ReorganizePagesSettings from "@app/components/tools/reorganizePages/ReorganizePagesSettings";
import {
  defaultReorganizePagesParameters,
  ReorganizePagesParameters,
} from "@app/hooks/tools/reorganizePages/useReorganizePagesParameters";

const meta: Meta<typeof ReorganizePagesSettings> = {
  title: "Tools/ReorganizePages/ReorganizePagesSettings",
  component: ReorganizePagesSettings,
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
type Story = StoryObj<typeof ReorganizePagesSettings>;

function SettingsDemo({
  initial,
  disabled,
}: {
  initial?: Partial<ReorganizePagesParameters>;
  disabled?: boolean;
}) {
  const [parameters, setParameters] = useState<ReorganizePagesParameters>({
    ...defaultReorganizePagesParameters,
    ...initial,
  });

  return (
    <ReorganizePagesSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

/** Custom order mode (default): the page order text input is shown. */
export const Default: Story = { render: () => <SettingsDemo /> };

/** A preset mode (e.g. reverse) that doesn't require a page order input. */
export const PresetMode: Story = {
  render: () => <SettingsDemo initial={{ customMode: "REVERSE_ORDER" }} />,
};

/** Disabled state, e.g. while no files are loaded or processing is in progress. */
export const Disabled: Story = {
  render: () => <SettingsDemo disabled />,
};
