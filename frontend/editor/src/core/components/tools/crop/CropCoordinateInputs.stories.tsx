import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CropCoordinateInputs from "@app/components/tools/crop/CropCoordinateInputs";
import { Rectangle } from "@app/utils/cropCoordinates";

const meta = {
  title: "Tools/Crop/CropCoordinateInputs",
  component: CropCoordinateInputs,
  parameters: { layout: "padded" },
  args: {
    cropArea: { x: 50, y: 50, width: 300, height: 400 },
    onCoordinateChange: () => {},
  },
} satisfies Meta<typeof CropCoordinateInputs>;
export default meta;
type Story = StoryObj<typeof meta>;

const pageBox = { x: 0, y: 0, width: 595.28, height: 841.89 };

function Demo({
  initialCropArea = { x: 50, y: 50, width: 300, height: 400 },
  disabled,
  showAutomationInfo,
  withBounds = true,
}: {
  initialCropArea?: Rectangle;
  disabled?: boolean;
  showAutomationInfo?: boolean;
  withBounds?: boolean;
}) {
  const [cropArea, setCropArea] = useState<Rectangle>(initialCropArea);

  return (
    <CropCoordinateInputs
      cropArea={cropArea}
      onCoordinateChange={(field, value) =>
        setCropArea((prev) => ({
          ...prev,
          [field]: typeof value === "number" ? value : Number(value) || 0,
        }))
      }
      disabled={disabled}
      pageBox={withBounds ? pageBox : undefined}
      showAutomationInfo={showAutomationInfo}
    />
  );
}

export const Default: Story = { render: () => <Demo /> };

export const AutomationInfo: Story = {
  render: () => <Demo showAutomationInfo />,
};

export const Disabled: Story = { render: () => <Demo disabled /> };
