import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";

interface ConvertOfficeEngineSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  disabled?: boolean;
}

/** Picks Stirling Office Convert or LibreOffice for this conversion; starts from the server setting. */
const ConvertOfficeEngineSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ConvertOfficeEngineSettingsProps) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const checked =
    parameters.useStirlingOfficeConvert ??
    config?.stirlingOfficeConversion ??
    false;

  return (
    <Switch
      data-testid="stirling-office-convert-switch"
      label={t(
        "convert.stirlingOfficeConvert",
        "Use Stirling Office Convert (beta)",
      )}
      description={t(
        "convert.stirlingOfficeConvertDescription",
        "Better, faster conversions with less memory. Turn off to use LibreOffice.",
      )}
      checked={checked}
      onChange={(event) =>
        onParameterChange(
          "useStirlingOfficeConvert",
          event.currentTarget.checked,
        )
      }
      disabled={disabled}
    />
  );
};

export default ConvertOfficeEngineSettings;
