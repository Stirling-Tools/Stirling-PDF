import { Stack, Checkbox, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

interface TimestampToggleSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

const TimestampToggleSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: TimestampToggleSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      <Checkbox
        label={t(
          "certSign.timestamp.label",
          "Add a trusted timestamp (recommended)",
        )}
        checked={parameters.addTimestamp}
        onChange={(event) =>
          onParameterChange("addTimestamp", event.currentTarget.checked)
        }
        disabled={disabled}
      />
      <Text size="xs" c="dimmed">
        {t(
          "certSign.timestamp.note",
          "Records when the signature was applied, using a trusted timestamp server. Turn this off if this environment has no network access to reach one.",
        )}
      </Text>
    </Stack>
  );
};

export default TimestampToggleSettings;
