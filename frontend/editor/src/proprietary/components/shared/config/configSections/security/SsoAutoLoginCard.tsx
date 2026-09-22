import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { Stack, Paper } from "@mantine/core";
import type { ConnectionsCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** Send unauthenticated users straight to the SSO provider. */
export function SsoAutoLoginCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
  getDisabledStyles,
}: ConnectionsCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.connections.ssoAutoLogin.enable",
            "Enable SSO Auto Login",
          )}
          info={t(
            "admin.settings.connections.ssoAutoLogin.description",
            "Automatically redirect to SSO login when authentication is required",
          )}
          pending={isFieldPending("ssoAutoLogin")}
          checked={settings?.ssoAutoLogin || false}
          onChange={(checked) => {
            if (!loginEnabled) return; // Block change when login disabled
            setSettings({
              ...settings,
              ssoAutoLogin: checked,
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />
      </Stack>
    </Paper>
  );
}
