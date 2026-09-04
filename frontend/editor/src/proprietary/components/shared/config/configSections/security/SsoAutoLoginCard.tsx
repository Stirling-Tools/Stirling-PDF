import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Stack, Paper, Text, Group, Switch, Badge } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
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
                "admin.settings.connections.ssoAutoLogin.enable",
                "Enable SSO Auto Login",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.connections.ssoAutoLogin.description",
                "Automatically redirect to SSO login when authentication is required",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings?.ssoAutoLogin || false}
              onChange={(e) => {
                if (!loginEnabled) return; // Block change when login disabled
                setSettings({
                  ...settings,
                  ssoAutoLogin: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("ssoAutoLogin")} />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
