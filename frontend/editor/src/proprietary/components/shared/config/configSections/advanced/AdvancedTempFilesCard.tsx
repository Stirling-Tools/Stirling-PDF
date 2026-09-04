import { useTranslation } from "react-i18next";
import {
  NumberInput,
  Switch,
  Stack,
  Paper,
  Text,
  Group,
  TextInput,
} from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import type { AdvancedCardProps } from "@app/components/shared/config/configSections/advanced/advancedCardProps";

/** Where temp files live and when they are swept. */
export function AdvancedTempFilesCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: AdvancedCardProps) {
  const { t } = useTranslation();
  const { getDisabledStyles } = useLoginRequired();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          {t(
            "admin.settings.advanced.tempFileManagement.description",
            "Configure temporary file storage and cleanup behavior",
          )}
        </Text>

        <div>
          <TextInput
            label={t(
              "admin.settings.advanced.tempFileManagement.baseTmpDir.label",
              "Base Temp Directory",
            )}
            description={t(
              "admin.settings.advanced.tempFileManagement.baseTmpDir.description",
              "Base directory for temporary files (leave empty for default: java.io.tmpdir/stirling-pdf)",
            )}
            value={settings.tempFileManagement?.baseTmpDir || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                tempFileManagement: {
                  ...settings.tempFileManagement,
                  baseTmpDir: e.target.value,
                },
              })
            }
            placeholder={t(
              "admin.settings.advanced.tempFileManagement.baseTmpDir.placeholder",
              "Default: java.io.tmpdir/stirling-pdf",
            )}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <TextInput
            label={t(
              "admin.settings.advanced.tempFileManagement.libreofficeDir.label",
              "LibreOffice Temp Directory",
            )}
            description={t(
              "admin.settings.advanced.tempFileManagement.libreofficeDir.description",
              "Directory for LibreOffice temp files (leave empty for default: baseTmpDir/libreoffice)",
            )}
            value={settings.tempFileManagement?.libreofficeDir || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                tempFileManagement: {
                  ...settings.tempFileManagement,
                  libreofficeDir: e.target.value,
                },
              })
            }
            placeholder={t(
              "admin.settings.advanced.tempFileManagement.libreofficeDir.placeholder",
              "Default: baseTmpDir/libreoffice",
            )}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <TextInput
            label={t(
              "admin.settings.advanced.tempFileManagement.systemTempDir.label",
              "System Temp Directory",
            )}
            description={t(
              "admin.settings.advanced.tempFileManagement.systemTempDir.description",
              "System temp directory to clean (only used if cleanupSystemTemp is enabled)",
            )}
            value={settings.tempFileManagement?.systemTempDir || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                tempFileManagement: {
                  ...settings.tempFileManagement,
                  systemTempDir: e.target.value,
                },
              })
            }
            placeholder={t(
              "admin.settings.advanced.tempFileManagement.systemTempDir.placeholder",
              "System temp directory path",
            )}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <TextInput
            label={t(
              "admin.settings.advanced.tempFileManagement.prefix.label",
              "Temp File Prefix",
            )}
            description={t(
              "admin.settings.advanced.tempFileManagement.prefix.description",
              "Prefix for temp file names",
            )}
            value={settings.tempFileManagement?.prefix || "stirling-pdf-"}
            onChange={(e) =>
              setSettings({
                ...settings,
                tempFileManagement: {
                  ...settings.tempFileManagement,
                  prefix: e.target.value,
                },
              })
            }
            placeholder="stirling-pdf-"
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            label={t(
              "admin.settings.advanced.tempFileManagement.maxAgeHours.label",
              "Max Age (hours)",
            )}
            description={t(
              "admin.settings.advanced.tempFileManagement.maxAgeHours.description",
              "Maximum age in hours before temp files are cleaned up",
            )}
            value={settings.tempFileManagement?.maxAgeHours ?? 24}
            onChange={(value) =>
              setSettings({
                ...settings,
                tempFileManagement: {
                  ...settings.tempFileManagement,
                  maxAgeHours: Number(value),
                },
              })
            }
            min={1}
            max={720}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <NumberInput
            label={t(
              "admin.settings.advanced.tempFileManagement.cleanupIntervalMinutes.label",
              "Cleanup Interval (minutes)",
            )}
            description={t(
              "admin.settings.advanced.tempFileManagement.cleanupIntervalMinutes.description",
              "How often to run cleanup (in minutes)",
            )}
            value={settings.tempFileManagement?.cleanupIntervalMinutes ?? 30}
            onChange={(value) =>
              setSettings({
                ...settings,
                tempFileManagement: {
                  ...settings.tempFileManagement,
                  cleanupIntervalMinutes: Number(value),
                },
              })
            }
            min={1}
            max={1440}
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
                "admin.settings.advanced.tempFileManagement.startupCleanup.label",
                "Startup Cleanup",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.advanced.tempFileManagement.startupCleanup.description",
                "Clean up old temp files on application startup",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.tempFileManagement?.startupCleanup ?? true}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  tempFileManagement: {
                    ...settings.tempFileManagement,
                    startupCleanup: e.target.checked,
                  },
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge
              show={isFieldPending("tempFileManagement.startupCleanup")}
            />
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
                "admin.settings.advanced.tempFileManagement.cleanupSystemTemp.label",
                "Cleanup System Temp",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.advanced.tempFileManagement.cleanupSystemTemp.description",
                "Whether to clean broader system temp directory (use with caution)",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.tempFileManagement?.cleanupSystemTemp ?? false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  tempFileManagement: {
                    ...settings.tempFileManagement,
                    cleanupSystemTemp: e.target.checked,
                  },
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge
              show={isFieldPending("tempFileManagement.cleanupSystemTemp")}
            />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
