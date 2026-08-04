import { Divider, NumberInput, Select, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { InsertBlankPagesParameters } from "@app/hooks/tools/insertBlankPages/useInsertBlankPagesParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

const PAGE_SIZE_OPTIONS = [
  { value: "A4", label: "A4" },
  { value: "LETTER", label: "Letter" },
  { value: "LEGAL", label: "Legal" },
  { value: "A3", label: "A3" },
  { value: "A5", label: "A5" },
  { value: "TABLOID", label: "Tabloid" },
];

export default function InsertBlankPagesSettings({
  parameters,
  onParameterChange,
  disabled,
}: {
  parameters: InsertBlankPagesParameters;
  onParameterChange: <K extends keyof InsertBlankPagesParameters>(
    key: K,
    value: InsertBlankPagesParameters[K],
  ) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <NumberInput
        label={t("insertBlankPages.position", "Position")}
        description={t("insertBlankPages.positionDescription", "Page number after which to insert blank pages (0 for beginning)")}
        value={parameters.position}
        onChange={(v) => onParameterChange("position", v ?? 0)}
        min={0}
        disabled={disabled}
      />
      
      <NumberInput
        label={t("insertBlankPages.count", "Number of pages")}
        description={t("insertBlankPages.countDescription", "How many blank pages to insert")}
        value={parameters.count}
        onChange={(v) => onParameterChange("count", v ?? 1)}
        min={1}
        max={100}
        disabled={disabled}
      />
      
      <Divider />
      
      <Select
        label={t("insertBlankPages.pageSize", "Page size")}
        data={PAGE_SIZE_OPTIONS}
        value={parameters.pageSize}
        onChange={(v) => onParameterChange("pageSize", v ?? "A4")}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />
    </Stack>
  );
}
