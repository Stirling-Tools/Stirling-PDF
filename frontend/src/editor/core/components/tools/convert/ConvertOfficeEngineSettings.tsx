import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useOfficeConversionDefault } from "@editor/hooks/useOfficeConversionDefault";
import { ConvertParameters } from "@editor/hooks/tools/convert/useConvertParameters";

interface ConvertOfficeEngineSettingsProps {
  parameters: Pick<ConvertParameters, "useStirlingOfficeConvert">;
  onParameterChange: (key: "useStirlingOfficeConvert", value: boolean) => void;
  disabled?: boolean;
  endpointName?: string;
}

/** Picks Stirling Office Convert or the standard converter; starts from the server setting. */
const ConvertOfficeEngineSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  endpointName,
}: ConvertOfficeEngineSettingsProps) => {
  const { t } = useTranslation();
  const serverDefault = useOfficeConversionDefault(endpointName);
  const checked = parameters.useStirlingOfficeConvert ?? serverDefault;

  return (
    <Switch
      data-testid="stirling-office-convert-switch"
      label={t(
        "convert.stirlingOfficeConvert",
        "Use Stirling Office Convert (beta)",
      )}
      description={t(
        "convert.stirlingOfficeConvertDescription",
        "Better, faster conversions with less memory. Turn off to use the standard converter.",
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
