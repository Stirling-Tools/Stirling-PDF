import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WatermarkImageFile from "@app/components/tools/addWatermark/WatermarkImageFile";
import {
  AddWatermarkParameters,
  defaultParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

const meta = {
  title: "Tools/AddWatermark/WatermarkImageFile",
  component: WatermarkImageFile,
} satisfies Meta<typeof WatermarkImageFile>;
export default meta;

type Story = StoryObj<typeof meta>;

const makeImageFile = (name: string, sizeBytes: number): File =>
  new File([new Uint8Array(sizeBytes)], name, { type: "image/png" });

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the file picker interaction working in the canvas.
const WatermarkImageFileDemo = (props: {
  initialParameters: AddWatermarkParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<AddWatermarkParameters>(
    props.initialParameters,
  );

  return (
    <WatermarkImageFile
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
    <WatermarkImageFileDemo
      initialParameters={{ ...defaultParameters, watermarkType: "image" }}
    />
  ),
};

export const WithSelectedImage: Story = {
  render: () => (
    <WatermarkImageFileDemo
      initialParameters={{
        ...defaultParameters,
        watermarkType: "image",
        watermarkImage: makeImageFile("logo.png", 20_480),
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <WatermarkImageFileDemo
      initialParameters={{ ...defaultParameters, watermarkType: "image" }}
      disabled
    />
  ),
};
