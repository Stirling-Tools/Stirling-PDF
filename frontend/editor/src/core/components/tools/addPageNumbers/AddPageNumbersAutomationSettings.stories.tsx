import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddPageNumbersAutomationSettings from "@app/components/tools/addPageNumbers/AddPageNumbersAutomationSettings";
import {
  defaultParameters,
  type AddPageNumbersParameters,
} from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";

/** Page-number settings in the form the pipeline builder embeds. */
const meta: Meta<typeof AddPageNumbersAutomationSettings> = {
  title: "Tools/AddPageNumbers/AddPageNumbersAutomationSettings",
  component: AddPageNumbersAutomationSettings,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AddPageNumbersAutomationSettings>;

function Demo({
  overrides,
  disabled,
}: {
  overrides?: Partial<AddPageNumbersParameters>;
  disabled?: boolean;
}) {
  const [parameters, setParameters] = useState<AddPageNumbersParameters>({
    ...defaultParameters,
    ...overrides,
  });
  return (
    <AddPageNumbersAutomationSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

/** Defaults: Times 12pt, starting at 1, no custom text. */
export const Default: Story = { render: () => <Demo /> };

/** A custom template around the number. */
export const CustomText: Story = {
  render: () => <Demo overrides={{ customText: "Page {n} of {total}" }} />,
};

/** Numbering only part of the document, starting mid-way. */
export const PageRangeAndOffset: Story = {
  render: () => (
    <Demo overrides={{ pagesToNumber: "3-12,15", startingNumber: 7 }} />
  ),
};

/** Zero-padded numbers, for documents filed by page. */
export const ZeroPadded: Story = {
  render: () => <Demo overrides={{ zeroPad: 3 }} />,
};

/** A different face and a larger size. */
export const CourierLarge: Story = {
  render: () => <Demo overrides={{ fontType: "Courier", fontSize: 24 }} />,
};

/** Inert. */
export const Disabled: Story = { render: () => <Demo disabled /> };
