import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddStampAutomationSettings from "@app/components/tools/addStamp/AddStampAutomationSettings";
import {
  defaultParameters,
  type AddStampParameters,
} from "@app/components/tools/addStamp/useAddStampParameters";

/** Stamp settings in the form the pipeline builder embeds. */
const meta: Meta<typeof AddStampAutomationSettings> = {
  title: "Tools/AddStamp/AddStampAutomationSettings",
  component: AddStampAutomationSettings,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AddStampAutomationSettings>;

function Demo({
  overrides,
  disabled,
}: {
  overrides?: Partial<AddStampParameters>;
  disabled?: boolean;
}) {
  const [parameters, setParameters] = useState<AddStampParameters>({
    ...defaultParameters,
    ...overrides,
  });
  return (
    <AddStampAutomationSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

/** Defaults — no stamp text entered yet. */
export const Default: Story = { render: () => <Demo /> };

/** A typical text stamp. */
export const TextStamp: Story = {
  render: () => <Demo overrides={{ stampText: "CONFIDENTIAL" }} />,
};

/** Rotated and part-transparent, the usual watermark-style stamp. */
export const RotatedTranslucent: Story = {
  render: () => (
    <Demo overrides={{ stampText: "DRAFT", rotation: 45, opacity: 30 }} />
  ),
};

/** A non-Roman alphabet, which selects a different embedded face. */
export const JapaneseAlphabet: Story = {
  render: () => (
    <Demo overrides={{ stampText: "社外秘", alphabet: "japanese" }} />
  ),
};

/** Applied to a page range rather than the whole document. */
export const PageRange: Story = {
  render: () => (
    <Demo overrides={{ stampText: "EXHIBIT A", pageNumbers: "1,4-9" }} />
  ),
};

/** Inert. */
export const Disabled: Story = { render: () => <Demo disabled /> };
