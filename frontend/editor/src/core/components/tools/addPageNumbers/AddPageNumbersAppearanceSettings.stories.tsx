/**
 * How the page number looks: margin, size, face, zero padding and the optional
 * text wrapped around it. This is the other half of the Add Page Numbers
 * settings — the position panel places the number, this one styles it — and
 * every parameter here is one that panel does not render.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddPageNumbersAppearanceSettings from "@app/components/tools/addPageNumbers/AddPageNumbersAppearanceSettings";
import {
  defaultParameters,
  type AddPageNumbersParameters,
} from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";

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
    <AddPageNumbersAppearanceSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

const meta: Meta<typeof AddPageNumbersAppearanceSettings> = {
  title: "Tools/AddPageNumbers/AppearanceSettings",
  component: AddPageNumbersAppearanceSettings,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AddPageNumbersAppearanceSettings>;

/** Defaults: medium margin, 12pt Times, no padding, no custom text. */
export const Default: Story = { render: () => <Demo /> };

/** The margin extremes, which decide how far the number sits from the edge. */
export const SmallMargin: Story = {
  render: () => <Demo overrides={{ customMargin: "small" }} />,
};

export const ExtraLargeMargin: Story = {
  render: () => <Demo overrides={{ customMargin: "x-large" }} />,
};

export const CourierFace: Story = {
  render: () => <Demo overrides={{ fontType: "Courier" }} />,
};

export const LargeType: Story = {
  render: () => <Demo overrides={{ fontSize: 24 }} />,
};

/** Padding to a fixed width, for documents whose numbers must sort as text. */
export const ZeroPadded: Story = {
  render: () => <Demo overrides={{ zeroPad: 3 }} />,
};

/** `{n}` is the placeholder the number is substituted into. */
export const CustomText: Story = {
  render: () => <Demo overrides={{ customText: "Page {n}" }} />,
};

/** Everything at once, which is where the fields crowd if they are going to. */
export const FullyCustomised: Story = {
  render: () => (
    <Demo
      overrides={{
        customMargin: "large",
        fontType: "Helvetica",
        fontSize: 18,
        zeroPad: 4,
        customText: "Section 3 — page {n}",
      }}
    />
  ),
};

/** Disabled while the tool is running. */
export const Disabled: Story = { render: () => <Demo disabled /> };
