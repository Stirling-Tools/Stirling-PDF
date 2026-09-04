import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { NumberInput, Stack, Paper, Group, Alert } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { SecurityCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** What the audit trail records and how long it is kept. */
export function AuditLoggingCard({
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
            "admin.settings.security.audit.enabled.label",
            "Enable Audit Logging",
          )}
          info={t(
            "admin.settings.security.audit.enabled.description",
            "Track user actions and system events for compliance and security monitoring",
          )}
          pending={isFieldPending("audit.enabled")}
          checked={settings?.audit?.enabled || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              audit: { ...settings?.audit, enabled: checked },
            })
          }
          disabled={!loginEnabled}
        />

        <div>
          <NumberInput
            name="audit_level"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.audit.level.label",
                    "Audit Level",
                  )}
                </span>
                <PendingBadge show={isFieldPending("audit.level")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.audit.level.description",
                    "0=OFF, 1=BASIC, 2=STANDARD, 3=VERBOSE",
                  )}
                />
              </Group>
            }
            value={settings?.audit?.level || 2}
            onChange={(value) =>
              setSettings({
                ...settings,
                audit: { ...settings?.audit, level: Number(value) },
              })
            }
            min={0}
            max={3}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            name="audit_retentionDays"
            label={
              <Group component="span" gap="xs">
                <span>
                  {t(
                    "admin.settings.security.audit.retentionDays.label",
                    "Audit Retention (days)",
                  )}
                </span>
                <PendingBadge show={isFieldPending("audit.retentionDays")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.security.audit.retentionDays.description",
                    "Number of days to retain audit logs",
                  )}
                />
              </Group>
            }
            value={settings?.audit?.retentionDays || 90}
            onChange={(value) =>
              setSettings({
                ...settings,
                audit: { ...settings?.audit, retentionDays: Number(value) },
              })
            }
            min={1}
            max={3650}
            disabled={!loginEnabled}
          />
        </div>

        <Alert
          color="yellow"
          icon={<LocalIcon icon="info" />}
          title={t(
            "admin.settings.security.audit.advancedOptions.title",
            "Advanced Options",
          )}
        >
          {t(
            "admin.settings.security.audit.advancedOptions.description",
            "The following options increase processing time and memory usage. Enable only if truly needed.",
          )}
        </Alert>

        <SettingsToggleRow
          label={t(
            "admin.settings.security.audit.captureFileHash.label",
            "Capture File Hash",
          )}
          info={t(
            "admin.settings.security.audit.captureFileHash.description",
            "Store MD5 hash of processed files for audit trail verification",
          )}
          pending={isFieldPending("audit.captureFileHash")}
          checked={settings?.audit?.captureFileHash || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              audit: {
                ...settings?.audit,
                captureFileHash: checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.security.audit.capturePdfAuthor.label",
            "Capture PDF Author",
          )}
          info={t(
            "admin.settings.security.audit.capturePdfAuthor.description",
            "Extract author field from PDF documents during processing",
          )}
          pending={isFieldPending("audit.capturePdfAuthor")}
          checked={settings?.audit?.capturePdfAuthor || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              audit: {
                ...settings?.audit,
                capturePdfAuthor: checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.security.audit.captureOperationResults.label",
            "Capture Operation Results",
          )}
          info={t(
            "admin.settings.security.audit.captureOperationResults.description",
            "Store output file information and processing results in audit logs",
          )}
          pending={isFieldPending("audit.captureOperationResults")}
          checked={settings?.audit?.captureOperationResults || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              audit: {
                ...settings?.audit,
                captureOperationResults: checked,
              },
            })
          }
          disabled={!loginEnabled}
        />
      </Stack>
    </Paper>
  );
}
