import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  NumberInput,
  Switch,
  Stack,
  Paper,
  Text,
  Group,
  Alert,
  Badge,
} from "@mantine/core";
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
            ENTERPRISE
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
                "admin.settings.security.audit.enabled.label",
                "Enable Audit Logging",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.security.audit.enabled.description",
                "Track user actions and system events for compliance and security monitoring",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              name="audit_enabled"
              checked={settings?.audit?.enabled || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  audit: { ...settings?.audit, enabled: e.target.checked },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge show={isFieldPending("audit.enabled")} />
          </Group>
        </div>

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
              </Group>
            }
            description={t(
              "admin.settings.security.audit.level.description",
              "0=OFF, 1=BASIC, 2=STANDARD, 3=VERBOSE",
            )}
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
              </Group>
            }
            description={t(
              "admin.settings.security.audit.retentionDays.description",
              "Number of days to retain audit logs",
            )}
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
                "admin.settings.security.audit.captureFileHash.label",
                "Capture File Hash",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.security.audit.captureFileHash.description",
                "Store MD5 hash of processed files for audit trail verification",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              name="audit_captureFileHash"
              checked={settings?.audit?.captureFileHash || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  audit: {
                    ...settings?.audit,
                    captureFileHash: e.target.checked,
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge show={isFieldPending("audit.captureFileHash")} />
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
                "admin.settings.security.audit.capturePdfAuthor.label",
                "Capture PDF Author",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.security.audit.capturePdfAuthor.description",
                "Extract author field from PDF documents during processing",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              name="audit_capturePdfAuthor"
              checked={settings?.audit?.capturePdfAuthor || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  audit: {
                    ...settings?.audit,
                    capturePdfAuthor: e.target.checked,
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge show={isFieldPending("audit.capturePdfAuthor")} />
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
                "admin.settings.security.audit.captureOperationResults.label",
                "Capture Operation Results",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.security.audit.captureOperationResults.description",
                "Store output file information and processing results in audit logs",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              name="audit_captureOperationResults"
              checked={settings?.audit?.captureOperationResults || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  audit: {
                    ...settings?.audit,
                    captureOperationResults: e.target.checked,
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge
              show={isFieldPending("audit.captureOperationResults")}
            />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
