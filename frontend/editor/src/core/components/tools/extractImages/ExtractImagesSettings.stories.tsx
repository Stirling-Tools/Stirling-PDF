import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ExtractImagesSettings from "@app/components/tools/extractImages/ExtractImagesSettings";
import {
  ExtractImagesParameters,
  defaultParameters,
} from "@app/hooks/tools/extractImages/useExtractImagesParameters";

const meta = {
  title: "Tools/ExtractImages/ExtractImagesSettings",
  component: ExtractImagesSettings,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof ExtractImagesSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the dropdown interactive in the canvas.
const ExtractImagesSettingsDemo = (props: {
  initialParameters: ExtractImagesParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<ExtractImagesParameters>(
    props.initialParameters,
  );

  return (
    <ExtractImagesSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={props.disabled}
    />
  );
};

export const Default: Story = {
  render: () => (
    <ExtractImagesSettingsDemo initialParameters={defaultParameters} />
  ),
};

export const JpgFormat: Story = {
  render: () => (
    <ExtractImagesSettingsDemo
      initialParameters={{ ...defaultParameters, format: "jpg" }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <ExtractImagesSettingsDemo initialParameters={defaultParameters} disabled />
  ),
};
