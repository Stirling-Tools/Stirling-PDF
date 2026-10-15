import { Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AdjustColorsRustParameters } from "@app/hooks/tools/adjustColorsRust/useAdjustColorsRustParameters";

interface Props {
  parameters: AdjustColorsRustParameters;
  onParameterChange: <K extends keyof AdjustColorsRustParameters>(
    key: K,
    value: AdjustColorsRustParameters[K],
  ) => void;
  disabled?: boolean;
}

export default function AdjustColorsRustProcessingSettings({
  parameters,
  onParameterChange,
  disabled,
}: Props) {
  const { t } = useTranslation();

  return (
    <Checkbox
      label={t("adjustColorsRust.processOnServer", "Process on server")}
      description={t(
        "adjustColorsRust.processOnServerDesc",
        "Run the same Rust code natively on the server instead of in your browser",
      )}
      checked={parameters.processOnServer}
      onChange={(event) =>
        onParameterChange("processOnServer", event.currentTarget.checked)
      }
      disabled={disabled}
    />
  );
}
