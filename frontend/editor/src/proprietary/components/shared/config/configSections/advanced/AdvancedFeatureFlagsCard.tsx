import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { Stack, Paper } from "@mantine/core";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import type { AdvancedCardProps } from "@app/components/shared/config/configSections/advanced/advancedCardProps";

/** Server-wide switches. All three need a restart to take effect. */
export function AdvancedFeatureFlagsCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: AdvancedCardProps) {
  const { t } = useTranslation();
  const { getDisabledStyles } = useLoginRequired();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.advanced.enableAlphaFunctionality.label",
            "Enable Alpha Features",
          )}
          info={t(
            "admin.settings.advanced.enableAlphaFunctionality.description",
            "Enable experimental and alpha-stage features (may be unstable)",
          )}
          pending={isFieldPending("enableAlphaFunctionality")}
          checked={settings.enableAlphaFunctionality || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              enableAlphaFunctionality: checked,
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.advanced.enableUrlToPDF.label",
            "Enable URL to PDF",
          )}
          info={t(
            "admin.settings.advanced.enableUrlToPDF.description",
            "Allow conversion of web pages to PDF documents (internal use only)",
          )}
          pending={isFieldPending("enableUrlToPDF")}
          checked={settings.enableUrlToPDF || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              enableUrlToPDF: checked,
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.advanced.disableSanitize.label",
            "Disable HTML Sanitization",
          )}
          info={t(
            "admin.settings.advanced.disableSanitize.description",
            "Disable HTML sanitization (WARNING: Security risk - can lead to XSS injections)",
          )}
          pending={isFieldPending("disableSanitize")}
          checked={settings.disableSanitize || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              disableSanitize: checked,
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />
      </Stack>
    </Paper>
  );
}
