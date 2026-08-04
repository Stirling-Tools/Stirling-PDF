import { useTranslation } from "react-i18next";
import { Stack, NumberInput, Button, Group, Text } from "@mantine/core";
import { ReplaceImageParameters } from "@app/hooks/tools/replaceImage/useReplaceImageParameters";

interface ReplaceImageSettingsProps {
  parameters: ReplaceImageParameters;
  onParameterChange: <K extends keyof ReplaceImageParameters>(
    key: K,
    value: ReplaceImageParameters[K],
  ) => void;
  disabled?: boolean;
  onReplaceImageSelect?: (file: File) => void;
  selectedReplacementFile?: File | null;
}

const ReplaceImageSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  onReplaceImageSelect,
  selectedReplacementFile,
}: ReplaceImageSettingsProps) => {
  const { t } = useTranslation();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onReplaceImageSelect) {
      onReplaceImageSelect(file);
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t(
          "replaceImage.settings.description",
          "Select a replacement image and optionally specify which image to replace.",
        )}
      </Text>

      {onReplaceImageSelect && (
        <Button component="label" variant="outline" disabled={disabled}>
          {selectedReplacementFile
            ? t("replaceImage.settings.selected", "Selected: {{name}}", {
                name: selectedReplacementFile.name,
              })
            : t("replaceImage.settings.selectImage", "Select Replacement Image")}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            hidden
            disabled={disabled}
          />
        </Button>
      )}

      <NumberInput
        label={t(
          "replaceImage.settings.imageIndex",
          "Image Index (0-based, optional)",
        )}
        description={t(
          "replaceImage.settings.imageIndexDescription",
          "Leave empty to replace all images, or specify the index of the image to replace.",
        )}
        value={parameters.imageIndex ?? ""}
        onChange={(value) =>
          onParameterChange("imageIndex", value === "" ? undefined : Number(value))
        }
        min={0}
        disabled={disabled}
        allowNegative={false}
      />

      <NumberInput
        label={t("replaceImage.settings.pageNumber", "Page Number (optional)")}
        description={t(
          "replaceImage.settings.pageNumberDescription",
          "Leave empty to search all pages, or specify the page number (1-based).",
        )}
        value={parameters.pageNumber ?? ""}
        onChange={(value) =>
          onParameterChange("pageNumber", value === "" ? undefined : Number(value))
        }
        min={1}
        disabled={disabled}
        allowNegative={false}
      />
    </Stack>
  );
};

export default ReplaceImageSettings;
