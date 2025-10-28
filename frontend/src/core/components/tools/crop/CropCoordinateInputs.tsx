import { Stack, Text, Group, NumberInput, Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Rectangle, PDFBounds } from "@app/utils/cropCoordinates";

interface CropCoordinateInputsProps {
  cropArea: Rectangle;
  onCoordinateChange: (field: keyof Rectangle, value: number | string) => void;
  disabled?: boolean;
  pdfBounds?: PDFBounds;
  showAutomationInfo?: boolean;
}

const CropCoordinateInputs = ({
  cropArea,
  onCoordinateChange,
  disabled = false,
  pdfBounds,
  showAutomationInfo = false
}: CropCoordinateInputsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      {showAutomationInfo && (
        <Alert color="blue" variant="light">
          <Text size="xs">
            {t("crop.automation.info", "Enter crop coordinates in PDF points. Origin (0,0) is at bottom-left. These values will be applied to all PDFs processed in this automation.")}
          </Text>
        </Alert>
      )}

      <Text size="sm" fw={500}>
        {t("crop.coordinates.title", "Position and Size")}
      </Text>

      <Group grow>
        <NumberInput
          label={t("crop.coordinates.x.label", "X Position")}
          description={showAutomationInfo ? t("crop.coordinates.x.desc", "Left edge (points)") : undefined}
          value={Math.round(cropArea.x * 10) / 10}
          onChange={(value) => onCoordinateChange('x', value)}
          disabled={disabled}
          min={0}
          max={pdfBounds?.actualWidth}
          step={0.1}
          decimalScale={1}
          size={showAutomationInfo ? "sm" : "xs"}
        />
        <NumberInput
          label={t("crop.coordinates.y.label", "Y Position")}
          description={showAutomationInfo ? t("crop.coordinates.y.desc", "Bottom edge (points)") : undefined}
          value={Math.round(cropArea.y * 10) / 10}
          onChange={(value) => onCoordinateChange('y', value)}
          disabled={disabled}
          min={0}
          max={pdfBounds?.actualHeight}
          step={0.1}
          decimalScale={1}
          size={showAutomationInfo ? "sm" : "xs"}
        />
      </Group>

      <Group grow>
        <NumberInput
          label={t("crop.coordinates.width.label", "Width")}
          description={showAutomationInfo ? t("crop.coordinates.width.desc", "Crop width (points)") : undefined}
          value={Math.round(cropArea.width * 10) / 10}
          onChange={(value) => onCoordinateChange('width', value)}
          disabled={disabled}
          min={0.1}
          max={pdfBounds?.actualWidth}
          step={0.1}
          decimalScale={1}
          size={showAutomationInfo ? "sm" : "xs"}
        />
        <NumberInput
          label={t("crop.coordinates.height.label", "Height")}
          description={showAutomationInfo ? t("crop.coordinates.height.desc", "Crop height (points)") : undefined}
          value={Math.round(cropArea.height * 10) / 10}
          onChange={(value) => onCoordinateChange('height', value)}
          disabled={disabled}
          min={0.1}
          max={pdfBounds?.actualHeight}
          step={0.1}
          decimalScale={1}
          size={showAutomationInfo ? "sm" : "xs"}
        />
      </Group>

      {showAutomationInfo && (
        <Alert color="gray" variant="light">
          <Text size="xs">
            {t("crop.automation.reference", "Reference: A4 page is 595.28 × 841.89 points (210mm × 297mm). 1 inch = 72 points.")}
          </Text>
        </Alert>
      )}
    </Stack>
  );
};

export default CropCoordinateInputs;
