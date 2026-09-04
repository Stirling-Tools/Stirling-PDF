import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { SettingsFieldLabel } from "@app/components/shared/config/SettingsFieldLabel";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { NumberInput, Stack, Paper, Group, Select } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { SecurityCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** Whether login is required at all, and how a failed one is throttled. */
export function AuthenticationCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: SecurityCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t("admin.settings.security.enableLogin.label", "Enable Login")}
          info={t(
            "admin.settings.security.enableLogin.description",
            "Require users to log in before accessing the application",
          )}
          pending={isFieldPending("enableLogin")}
          checked={settings?.enableLogin || false}
          onChange={(checked) =>
            setSettings({ ...settings, enableLogin: checked })
          }
          disabled={!loginEnabled}
        />

        <div>
          <Select
            name="loginMethod"
            label={
              <SettingsFieldLabel
                info={t(
                  "admin.settings.security.loginMethod.description",
                  "The authentication method to use for user login",
                )}
              >
                t( "admin.settings.security.loginMethod.label", "Login Method",
                )
              </SettingsFieldLabel>
            }
            value={settings?.loginMethod || "all"}
            onChange={(value) =>
              setSettings({ ...settings, loginMethod: value || "all" })
            }
            data={[
              {
                value: "all",
                label: t(
                  "admin.settings.security.loginMethod.all",
                  "All Methods",
                ),
              },
              {
                value: "normal",
                label: t(
                  "admin.settings.security.loginMethod.normal",
                  "Username/Password Only",
                ),
              },
              {
                value: "oauth2",
                label: t(
                  "admin.settings.security.loginMethod.oauth2",
                  "OAuth2 Only",
                ),
              },
              {
                value: "saml2",
                label: t(
                  "admin.settings.security.loginMethod.saml2",
                  "SAML2 Only",
                ),
              },
            ]}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
          {isFieldPending("loginMethod") && (
            <Group mt="xs">
              <PendingBadge show={true} />
            </Group>
          )}
        </div>

        <div>
          <NumberInput
            name="loginAttemptCount"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.loginAttemptCount.label",
                    "Login Attempt Limit",
                  )}
                </span>
                <PendingBadge show={isFieldPending("loginAttemptCount")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.loginAttemptCount.description",
                    "Maximum number of failed login attempts before account lockout",
                  )}
                />
              </Group>
            }
            value={settings?.loginAttemptCount || 0}
            onChange={(value) =>
              setSettings({ ...settings, loginAttemptCount: Number(value) })
            }
            min={0}
            max={100}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            name="loginResetTimeMinutes"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.loginResetTimeMinutes.label",
                    "Login Reset Time (minutes)",
                  )}
                </span>
                <PendingBadge show={isFieldPending("loginResetTimeMinutes")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.loginResetTimeMinutes.description",
                    "Time before failed login attempts are reset",
                  )}
                />
              </Group>
            }
            value={settings?.loginResetTimeMinutes || 0}
            onChange={(value) =>
              setSettings({
                ...settings,
                loginResetTimeMinutes: Number(value),
              })
            }
            min={0}
            max={1440}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <Select
            name="xFrameOptions"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.xFrameOptions.label",
                    "X-Frame-Options",
                  )}
                </span>
                <PendingBadge show={isFieldPending("xFrameOptions")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.xFrameOptions.description",
                    "Controls whether the application can be embedded in iframes",
                  )}
                />
              </Group>
            }
            value={settings?.xFrameOptions || "DENY"}
            onChange={(value) =>
              setSettings({ ...settings, xFrameOptions: value || "DENY" })
            }
            data={[
              {
                value: "DENY",
                label: t(
                  "admin.settings.security.xFrameOptions.deny",
                  "Deny (Prevents all framing)",
                ),
              },
              {
                value: "SAMEORIGIN",
                label: t(
                  "admin.settings.security.xFrameOptions.sameorigin",
                  "Same Origin (Allow framing from same domain)",
                ),
              },
              {
                value: "DISABLED",
                label: t(
                  "admin.settings.security.xFrameOptions.disabled",
                  "Disabled (No X-Frame-Options header)",
                ),
              },
            ]}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
        </div>
      </Stack>
    </Paper>
  );
}
