import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CropCoordinateInputs from "@app/components/tools/crop/CropCoordinateInputs";
import { Rectangle, PDFBounds } from "@app/utils/cropCoordinates";

const meta = {
  title: "Tools/Crop/CropCoordinateInputs",
  component: CropCoordinateInputs,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CropCoordinateInputs>;
export default meta;
type Story = StoryObj<typeof meta>;

const pdfBounds: PDFBounds = {
  actualWidth: 595.28,
  actualHeight: 841.89,
  thumbnailWidth: 300,
  thumbnailHeight: 424,
  offsetX: 0,
  offsetY: 0,
  scale: 300 / 595.28,
};

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
      pdfBounds={withBounds ? pdfBounds : undefined}
      showAutomationInfo={showAutomationInfo}
    />
  );
}

export const Default: Story = { render: () => <Demo /> };

export const AutomationInfo: Story = {
  render: () => <Demo showAutomationInfo />,
};

export const Disabled: Story = { render: () => <Demo disabled /> };
