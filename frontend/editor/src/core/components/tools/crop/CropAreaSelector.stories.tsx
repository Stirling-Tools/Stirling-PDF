import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, MantineProvider } from "@mantine/core";
import CropAreaSelector from "@app/components/tools/crop/CropAreaSelector";
import { Rectangle, PDFBounds } from "@app/utils/cropCoordinates";
import { mantineTheme } from "@app/theme/mantineTheme";

// CropAreaSelector reads theme.other.crop (overlay/handle colors) defined on the
// core app's Mantine theme. The Storybook preview only provides the portal's
// theme, which has no `other.crop`, so nest the core theme here — Mantine merges
// nested providers with their parent, leaving everything else preview.tsx sets
// up untouched.
const meta = {
  title: "Tools/Crop/CropAreaSelector",
  component: CropAreaSelector,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <MantineProvider theme={mantineTheme}>
        <Story />
      </MantineProvider>
    ),
  ],
} satisfies Meta<typeof CropAreaSelector>;
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
}: {
  initialCropArea?: Rectangle;
  disabled?: boolean;
}) {
  const [cropArea, setCropArea] = useState<Rectangle>(initialCropArea);

  return (
    <Box
      style={{
        position: "relative",
        width: pdfBounds.thumbnailWidth,
        height: pdfBounds.thumbnailHeight,
      }}
    >
      <CropAreaSelector
        pdfBounds={pdfBounds}
        cropArea={cropArea}
        onCropAreaChange={setCropArea}
        disabled={disabled}
      >
        <Box
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "var(--mantine-color-gray-2)",
          }}
        />
      </CropAreaSelector>
    </Box>
  );
}

export const Default: Story = { render: () => <Demo /> };

export const Disabled: Story = { render: () => <Demo disabled /> };
