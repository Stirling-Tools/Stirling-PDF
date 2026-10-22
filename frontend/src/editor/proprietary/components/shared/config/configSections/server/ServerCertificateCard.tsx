import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { TextInput, NumberInput, Stack, Paper, Group } from "@mantine/core";
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
        <SettingsToggleRow
          label={t(
            "admin.settings.features.serverCertificate.enabled.label",
            "Enable Certificate Signing",
          )}
          info={t(
            "admin.settings.features.serverCertificate.enabled.description",
            'Offer "Sign with Stirling-PDF" using a certificate this server generates',
          )}
          pending={isFieldPending("serverCertificate.enabled")}
          checked={settings.serverCertificate?.enabled ?? true}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              serverCertificate: {
                ...settings.serverCertificate,
                enabled: checked,
              },
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />

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
                <InfoTooltip
                  label={t(
                    "admin.settings.features.serverCertificate.organizationName.description",
                    "Organization name for generated certificates",
                  )}
                />
              </Group>
            }
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
                <InfoTooltip
                  label={t(
                    "admin.settings.features.serverCertificate.validity.description",
                    "Number of days the certificate will be valid",
                  )}
                />
              </Group>
            }
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

        <SettingsToggleRow
          label={t(
            "admin.settings.features.serverCertificate.regenerateOnStartup.label",
            "Regenerate on Startup",
          )}
          info={t(
            "admin.settings.features.serverCertificate.regenerateOnStartup.description",
            "Generate new certificate on each application startup",
          )}
          pending={isFieldPending("serverCertificate.regenerateOnStartup")}
          checked={settings.serverCertificate?.regenerateOnStartup ?? false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              serverCertificate: {
                ...settings.serverCertificate,
                regenerateOnStartup: checked,
              },
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />
      </Stack>
    </Paper>
  );
}
