import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@editor/components/shared/config/SettingsToggleRow";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { NumberInput, Stack, Paper, Group } from "@mantine/core";
import PendingBadge from "@editor/components/shared/config/PendingBadge";
import type { SecurityCardProps } from "@editor/components/shared/config/configSections/security/securityCardProps";

interface AuditLoggingCardProps extends SecurityCardProps {
  /** Enterprise licenses may keep audit events indefinitely. */
  enterprise: boolean;
}

/** What the audit trail records and how long it is kept. */
export function AuditLoggingCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
  enterprise,
}: AuditLoggingCardProps) {
  const { t } = useTranslation();
  const retentionMax = enterprise ? 3650 : 30;
  const retentionValue = settings?.audit?.retentionDays;
  // A downgraded Enterprise instance can still hold 0 or a value above the
  // non-EE ceiling. Show what the cleanup service will actually apply.
  const displayedRetention =
    retentionValue == null
      ? 90
      : enterprise
        ? retentionValue
        : retentionValue <= 0
          ? 30
          : Math.min(retentionValue, 30);

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
                    enterprise
                      ? "admin.settings.security.audit.retentionDays.description"
                      : "admin.settings.security.audit.retentionDays.descriptionLimited",
                    enterprise
                      ? "Number of days to retain audit logs. Set 0 to keep them indefinitely."
                      : "Number of days to retain audit logs. Non-Enterprise deployments keep them for at most 30 days.",
                  )}
                />
              </Group>
            }
            value={displayedRetention}
            onChange={(value) => {
              const next = Number(value);
              setSettings({
                ...settings,
                audit: {
                  ...settings?.audit,
                  retentionDays: enterprise
                    ? next
                    : Math.min(Math.max(next, 1), 30),
                },
              });
            }}
            min={enterprise ? 0 : 1}
            max={retentionMax}
            disabled={!loginEnabled}
          />
        </div>

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
          warnWhenOn={t(
            "admin.settings.security.audit.advancedOptions.cost",
            "Now increasing processing time and memory usage on every operation.",
          )}
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
          warnWhenOn={t(
            "admin.settings.security.audit.advancedOptions.cost",
            "Now increasing processing time and memory usage on every operation.",
          )}
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
          warnWhenOn={t(
            "admin.settings.security.audit.advancedOptions.cost",
            "Now increasing processing time and memory usage on every operation.",
          )}
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
