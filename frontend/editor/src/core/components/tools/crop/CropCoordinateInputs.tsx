import { Stack, Text, Group, NumberInput, Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Rectangle } from "@app/utils/cropCoordinates";

interface CropCoordinateInputsProps {
  cropArea: Rectangle;
  onCoordinateChange: (field: keyof Rectangle, value: number | string) => void;
  disabled?: boolean;
  /** Page user-space bounds, so inputs cannot request an impossible region. */
  pageBox?: Rectangle;
  showAutomationInfo?: boolean;
}

const CropCoordinateInputs = ({
  cropArea,
  onCoordinateChange,
  disabled = false,
  pageBox,
  showAutomationInfo = false,
}: CropCoordinateInputsProps) => {
  const { t } = useTranslation();
  const inputSize = showAutomationInfo ? "sm" : "xs";

  return (
    <Stack gap="xs">
      {showAutomationInfo && (
        <Alert color="blue" variant="light">
          <Text size="xs">
            {t(
              "crop.automation.info",
              "Enter crop coordinates in PDF points. Origin (0,0) is at bottom-left. These values will be applied to all PDFs processed in this automation.",
            )}
          </Text>
        </Alert>
      )}

      <Text size="sm" fw={500}>
        {t("crop.coordinates.title", "Position and size (points)")}
      </Text>

      <Group grow>
        <NumberInput
          label={t("crop.coordinates.x.label", "X position")}
          value={Math.round(cropArea.x * 10) / 10}
          onChange={(value) => onCoordinateChange("x", value)}
          disabled={disabled}
          min={pageBox?.x ?? 0}
          max={pageBox ? pageBox.x + pageBox.width : undefined}
          step={0.1}
          decimalScale={1}
          size={inputSize}
        />
        <NumberInput
          label={t("crop.coordinates.y.label", "Y position")}
          value={Math.round(cropArea.y * 10) / 10}
          onChange={(value) => onCoordinateChange("y", value)}
          disabled={disabled}
          min={pageBox?.y ?? 0}
          max={pageBox ? pageBox.y + pageBox.height : undefined}
          step={0.1}
          decimalScale={1}
          size={inputSize}
        />
      </Group>

      <Group grow>
        <NumberInput
          label={t("crop.coordinates.width.label", "Width")}
          value={Math.round(cropArea.width * 10) / 10}
          onChange={(value) => onCoordinateChange("width", value)}
          disabled={disabled}
          min={0.1}
          max={pageBox?.width}
          step={0.1}
          decimalScale={1}
          size={inputSize}
        />
        <NumberInput
          label={t("crop.coordinates.height.label", "Height")}
          value={Math.round(cropArea.height * 10) / 10}
          onChange={(value) => onCoordinateChange("height", value)}
          disabled={disabled}
          min={0.1}
          max={pageBox?.height}
          step={0.1}
          decimalScale={1}
          size={inputSize}
        />
      </Group>

      {showAutomationInfo && (
        <Alert color="gray" variant="light">
          <Text size="xs">
            {t(
              "crop.automation.reference",
              "Reference: A4 page is 595.28 × 841.89 points (210mm × 297mm). 1 inch = 72 points.",
            )}
          </Text>
        </Alert>
      )}
    </Stack>
  );
};

export default CropCoordinateInputs;
