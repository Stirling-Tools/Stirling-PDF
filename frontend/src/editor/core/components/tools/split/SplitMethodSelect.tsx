import { Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  MethodOption,
  SplitMethod,
} from "@editor/constants/splitConstants";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

export interface SplitMethodSelectProps {
  options: MethodOption[];
  value: SplitMethod | null;
  onChange: (method: SplitMethod | null) => void;
  disabled?: boolean;
}

const SplitMethodSelect = ({
  options,
  value,
  onChange,
  disabled = false,
}: SplitMethodSelectProps) => {
  const { t } = useTranslation();

  const selected = options.find((option) => option.value === value);

  return (
    <Select
      {...infoLabelProps(
        t("split.methodLabel", "Method"),
        selected ? t(selected.tooltipKey, "") : undefined,
      )}
      placeholder={t("split.selectMethod", "Select a split method")}
      value={value}
      onChange={(next) => onChange(next as SplitMethod | null)}
      data={options.map((option) => ({
        value: option.value,
        label: t(option.nameKey, "Method"),
      }))}
      allowDeselect={false}
      disabled={disabled}
      comboboxProps={{
        withinPortal: true,
        zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
      }}
    />
  );
};

export default SplitMethodSelect;
