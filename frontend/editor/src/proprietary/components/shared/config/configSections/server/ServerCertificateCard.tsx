import { useTranslation } from "react-i18next";
import {
  TextInput,
  NumberInput,
  Switch,
  Stack,
  Paper,
  Text,
  Group,
} from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import type { GeneralCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

/**
 * The certificate behind "Sign with Stirling-PDF". This was the whole Features
 * row: one hook whose key said "features" while it read and wrote the system
 * section, so it rides the general draft now.
 */
export function ServerCertificateCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: GeneralCardProps) {
  const { t } = useTranslation();
  const { getDisabledStyles } = useLoginRequired();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          {t(
            "admin.settings.features.serverCertificate.description",
            'Configure server-side certificate generation for "Sign with Stirling-PDF" functionality',
          )}
        </Text>

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
                "admin.settings.features.serverCertificate.enabled.label",
                "Enable Server Certificate",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.features.serverCertificate.enabled.description",
                'Enable server-side certificate for "Sign with Stirling-PDF" option',
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.serverCertificate?.enabled ?? true}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  serverCertificate: {
                    ...settings.serverCertificate,
                    enabled: e.target.checked,
                  },
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("serverCertificate.enabled")} />
          </Group>
        </div>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.features.serverCertificate.organizationName.label",
                    "Organization Name",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("serverCertificate.organizationName")}
                />
              </Group>
            }
            description={t(
              "admin.settings.features.serverCertificate.organizationName.description",
              "Organization name for generated certificates",
            )}
            value={
              settings.serverCertificate?.organizationName || "Stirling PDF Inc"
            }
            onChange={(e) =>
              setSettings({
                ...settings,
                serverCertificate: {
                  ...settings.serverCertificate,
                  organizationName: e.target.value,
                },
              })
            }
            placeholder="Stirling-PDF"
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.features.serverCertificate.validity.label",
                    "Certificate Validity (days)",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("serverCertificate.validity")}
                />
              </Group>
            }
            description={t(
              "admin.settings.features.serverCertificate.validity.description",
              "Number of days the certificate will be valid",
            )}
            value={settings.serverCertificate?.validity ?? 365}
            onChange={(value) =>
              setSettings({
                ...settings,
                serverCertificate: {
                  ...settings.serverCertificate,
                  validity: Number(value),
                },
              })
            }
            min={1}
            max={3650}
            disabled={!loginEnabled}
          />
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
                "admin.settings.features.serverCertificate.regenerateOnStartup.label",
                "Regenerate on Startup",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.features.serverCertificate.regenerateOnStartup.description",
                "Generate new certificate on each application startup",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.serverCertificate?.regenerateOnStartup ?? false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  serverCertificate: {
                    ...settings.serverCertificate,
                    regenerateOnStartup: e.target.checked,
                  },
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge
              show={isFieldPending("serverCertificate.regenerateOnStartup")}
            />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
