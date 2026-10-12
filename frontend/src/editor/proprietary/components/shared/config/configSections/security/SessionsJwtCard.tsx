import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { NumberInput, Stack, Paper, Group } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { SecurityCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** How long a signed-in session lives, and the JWT knobs behind it. */
export function SessionsJwtCard({
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
          label={t(
            "admin.settings.security.jwt.enableKeyCleanup.label",
            "Enable Key Cleanup",
          )}
          info={t(
            "admin.settings.security.jwt.enableKeyCleanup.description",
            "Automatically remove old JWT keys after retention period",
          )}
          pending={isFieldPending("jwt.enableKeyCleanup")}
          checked={settings?.jwt?.enableKeyCleanup || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              jwt: {
                ...settings?.jwt,
                enableKeyCleanup: checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <div>
          <NumberInput
            name="jwt_tokenExpiryMinutes"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.jwt.tokenExpiryMinutes.label",
                    "Web Token Expiry (minutes)",
                  )}
                </span>
                <PendingBadge show={isFieldPending("jwt.tokenExpiryMinutes")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.jwt.tokenExpiryMinutes.description",
                    "Access token lifetime in minutes for web clients (default: 1440 = 24 hours)",
                  )}
                />
              </Group>
            }
            value={settings?.jwt?.tokenExpiryMinutes || 1440}
            onChange={(value) =>
              setSettings({
                ...settings,
                jwt: {
                  ...settings?.jwt,
                  tokenExpiryMinutes: Number(value),
                },
              })
            }
            min={1}
            max={43200}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            name="jwt_desktopTokenExpiryMinutes"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.jwt.desktopTokenExpiryMinutes.label",
                    "Desktop Token Expiry (minutes)",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("jwt.desktopTokenExpiryMinutes")}
                />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.jwt.desktopTokenExpiryMinutes.description",
                    "Access token lifetime in minutes for desktop clients. Desktop apps automatically detected via User-Agent and receive longer sessions for better UX (default: 43200 = 30 days)",
                  )}
                />
              </Group>
            }
            value={settings?.jwt?.desktopTokenExpiryMinutes || 43200}
            onChange={(value) =>
              setSettings({
                ...settings,
                jwt: {
                  ...settings?.jwt,
                  desktopTokenExpiryMinutes: Number(value),
                },
              })
            }
            min={1}
            max={525600}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            name="jwt_allowedClockSkewSeconds"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.jwt.allowedClockSkewSeconds.label",
                    "Clock Skew Tolerance (seconds)",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("jwt.allowedClockSkewSeconds")}
                />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.jwt.allowedClockSkewSeconds.description",
                    "Tolerance for client/server time drift during token validation (default: 60 seconds)",
                  )}
                />
              </Group>
            }
            value={settings?.jwt?.allowedClockSkewSeconds ?? 60}
            onChange={(value) =>
              setSettings({
                ...settings,
                jwt: {
                  ...settings?.jwt,
                  allowedClockSkewSeconds: Number(value),
                },
              })
            }
            min={0}
            max={300}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            name="jwt_refreshGraceMinutes"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.jwt.refreshGraceMinutes.label",
                    "Refresh Grace Period (minutes)",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("jwt.refreshGraceMinutes")}
                />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.jwt.refreshGraceMinutes.description",
                    "Allow token refresh within this many minutes after expiry (default: 15 minutes, max 3 attempts)",
                  )}
                />
              </Group>
            }
            value={settings?.jwt?.refreshGraceMinutes ?? 15}
            onChange={(value) =>
              setSettings({
                ...settings,
                jwt: {
                  ...settings?.jwt,
                  refreshGraceMinutes: Number(value),
                },
              })
            }
            min={0}
            max={120}
            disabled={!loginEnabled}
          />
        </div>

        <SettingsToggleRow
          label={t(
            "admin.settings.security.jwt.secureCookie.label",
            "Secure Cookie",
          )}
          info={t(
            "admin.settings.security.jwt.secureCookie.description",
            "Require HTTPS for JWT cookies (recommended for production)",
          )}
          pending={isFieldPending("jwt.secureCookie")}
          checked={settings?.jwt?.secureCookie || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              jwt: { ...settings?.jwt, secureCookie: checked },
            })
          }
          disabled={!loginEnabled}
        />
      </Stack>
    </Paper>
  );
}
