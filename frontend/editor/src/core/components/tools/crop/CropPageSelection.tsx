import { Stack, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import PageSelectionSyntaxHint from "@app/components/shared/PageSelectionSyntaxHint";
import { validatePageNumbers } from "@app/utils/pageSelection";

interface CropPageSelectionProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const CropPageSelection = ({
  value,
  onChange,
  disabled = false,
}: CropPageSelectionProps) => {
  const { t } = useTranslation();
  const [debouncedValue] = useDebouncedValue(value, 300);

  const trimmed = (debouncedValue ?? "").trim();
  const error =
    trimmed.length > 0 && !validatePageNumbers(trimmed)
      ? t(
          "crop.pageNumbers.error",
          "Invalid page selection. Use e.g. 1, 3, 5-8 or all.",
        )
      : undefined;

  return (
    <Stack gap="xs">
      <TextInput
        label={t("crop.pageNumbers.label", "Pages to Crop")}
        description={t(
          "crop.pageNumbers.description",
          "Crop the selected area on specific pages, or 'all' for every page.",
        )}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={t("crop.pageNumbers.placeholder", "e.g. 1, 3, 5-8 or all")}
        error={error}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
      />
      <PageSelectionSyntaxHint input={value} variant="compact" />
    </Stack>
  );
};

export default CropPageSelection;
