import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CompressSettings from "@app/components/tools/compress/CompressSettings";
import {
  CompressParameters,
  defaultParameters,
} from "@app/hooks/tools/compress/useCompressParameters";

const meta = {
  title: "Tools/Compress/CompressSettings",
  component: CompressSettings,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof CompressSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the sliders/inputs interactive in the canvas.
const CompressSettingsDemo = (props: {
  initialParameters: CompressParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<CompressParameters>(
    props.initialParameters,
  );

  return (
    <CompressSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={props.disabled}
    />
  );
};

export const Default: Story = {
  render: () => <CompressSettingsDemo initialParameters={defaultParameters} />,
};

export const FileSizeMethod: Story = {
  render: () => (
    <CompressSettingsDemo
      initialParameters={{
        ...defaultParameters,
        compressionMethod: "filesize",
        fileSizeValue: "5",
        fileSizeUnit: "MB",
      }}
    />
  ),
};

export const LineArtEnabled: Story = {
  render: () => (
    <CompressSettingsDemo
      initialParameters={{
        ...defaultParameters,
        lineArt: true,
        lineArtThreshold: 50,
        lineArtEdgeLevel: 2,
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <CompressSettingsDemo initialParameters={defaultParameters} disabled />
  ),
};
