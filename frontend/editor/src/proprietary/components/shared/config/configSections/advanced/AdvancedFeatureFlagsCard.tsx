import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Switch, Stack, Paper, Text, Group } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.advanced.enableAlphaFunctionality.label",
                "Enable Alpha Features",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.advanced.enableAlphaFunctionality.description",
                  "Enable experimental and alpha-stage features (may be unstable)",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.enableAlphaFunctionality || false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  enableAlphaFunctionality: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("enableAlphaFunctionality")} />
          </Group>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.advanced.enableUrlToPDF.label",
                "Enable URL to PDF",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.advanced.enableUrlToPDF.description",
                  "Allow conversion of web pages to PDF documents (internal use only)",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.enableUrlToPDF || false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  enableUrlToPDF: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("enableUrlToPDF")} />
          </Group>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.advanced.disableSanitize.label",
                "Disable HTML Sanitization",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.advanced.disableSanitize.description",
                  "Disable HTML sanitization (WARNING: Security risk - can lead to XSS injections)",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.disableSanitize || false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  disableSanitize: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("disableSanitize")} />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
