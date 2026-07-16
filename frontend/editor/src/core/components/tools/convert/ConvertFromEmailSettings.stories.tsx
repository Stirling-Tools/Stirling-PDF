import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ConvertFromEmailSettings from "@app/components/tools/convert/ConvertFromEmailSettings";
import {
  ConvertParameters,
  defaultParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const meta = {
  title: "Tools/Convert/ConvertFromEmailSettings",
  component: ConvertFromEmailSettings,
} satisfies Meta<typeof ConvertFromEmailSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function ConvertFromEmailSettingsDemo(
  props: Partial<React.ComponentProps<typeof ConvertFromEmailSettings>>,
) {
  const [parameters, setParameters] = useState<ConvertParameters>(
    props.parameters ?? defaultParameters,
  );

  return (
    <ConvertFromEmailSettings
      disabled={false}
      {...props}
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
    />
  );
}

/** Default state: attachments included, so the max-size input is visible. */
export const Default: Story = {
  render: () => <ConvertFromEmailSettingsDemo />,
};

/** Attachments excluded, hiding the max-attachment-size input. */
export const WithoutAttachments: Story = {
  render: () => (
    <ConvertFromEmailSettingsDemo
      parameters={{
        ...defaultParameters,
        emailOptions: {
          ...defaultParameters.emailOptions,
          includeAttachments: false,
        },
      }}
    />
  ),
};

/** All controls disabled, e.g. while a conversion is running. */
export const Disabled: Story = {
  render: () => <ConvertFromEmailSettingsDemo disabled />,
};
