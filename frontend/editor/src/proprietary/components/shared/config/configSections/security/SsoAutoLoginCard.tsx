import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { useNavigate } from "react-router-dom";
import { Stack, Paper, Group, Badge } from "@mantine/core";
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
  const navigate = useNavigate();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="flex-end" align="center">
          <Badge
            color="grape"
            size="sm"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/settings/adminPlan")}
            title={t(
              "admin.settings.badge.clickToUpgrade",
              "Click to view plan details",
            )}
          >
            PRO
          </Badge>
        </Group>

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
