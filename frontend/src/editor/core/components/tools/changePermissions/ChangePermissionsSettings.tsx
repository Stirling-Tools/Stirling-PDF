import { Stack, Checkbox, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangePermissionsParameters } from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";

interface ChangePermissionsSettingsProps {
  parameters: ChangePermissionsParameters;
  onParameterChange: <K extends keyof ChangePermissionsParameters>(
    key: K,
    value: ChangePermissionsParameters[K],
  ) => void;
  disabled?: boolean;
  /** A single PDF is being inspected; block edits until its settings are available. */
  isLoading?: boolean;
  /** Extraction failed for the selected PDF; manual settings remain usable. */
  hasReadError?: boolean;
}

const ChangePermissionsSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  isLoading = false,
  hasReadError = false,
}: ChangePermissionsSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      {isLoading && (
        <Text size="sm" role="status">
          {t("changePermissions.loading", "Loading current permissions…")}
        </Text>
      )}
      {hasReadError && (
        <Text size="sm" role="alert">
          {t(
            "changePermissions.error.readFailed",
            "Could not read this PDF's current permissions. Set the restrictions manually before applying changes.",
          )}
        </Text>
      )}
      <Stack gap="xs">
        {(
          Object.keys(parameters).filter((key) =>
            key.startsWith("prevent"),
          ) as Array<
            Exclude<
              keyof ChangePermissionsParameters,
              "ownerPassword" | "password"
            >
          >
        ).map((key) => (
          <Checkbox
            key={key}
            label={t(`changePermissions.permissions.${key}.label`, key)}
            checked={parameters[key]}
            onChange={(e) => onParameterChange(key, e.target.checked)}
            disabled={disabled || isLoading}
          />
        ))}
      </Stack>
    </Stack>
  );
};

export default ChangePermissionsSettings;
