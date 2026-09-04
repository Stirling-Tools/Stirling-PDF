import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { SettingsFieldLabel } from "@app/components/shared/config/SettingsFieldLabel";
import { NumberInput, Stack, Paper, TextInput } from "@mantine/core";
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
        <div>
          <TextInput
            label={
              <SettingsFieldLabel
                info={t(
                  "admin.settings.advanced.tempFileManagement.baseTmpDir.description",
                  "Base directory for temporary files (leave empty for default: java.io.tmpdir/stirling-pdf)",
                )}
              >
                t(
                "admin.settings.advanced.tempFileManagement.baseTmpDir.label",
                "Base Temp Directory", )
              </SettingsFieldLabel>
            }
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
            label={
              <SettingsFieldLabel
                info={t(
                  "admin.settings.advanced.tempFileManagement.libreofficeDir.description",
                  "Directory for LibreOffice temp files (leave empty for default: baseTmpDir/libreoffice)",
                )}
              >
                t(
                "admin.settings.advanced.tempFileManagement.libreofficeDir.label",
                "LibreOffice Temp Directory", )
              </SettingsFieldLabel>
            }
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
            label={
              <SettingsFieldLabel
                info={t(
                  "admin.settings.advanced.tempFileManagement.systemTempDir.description",
                  "System temp directory to clean (only used if cleanupSystemTemp is enabled)",
                )}
              >
                t(
                "admin.settings.advanced.tempFileManagement.systemTempDir.label",
                "System Temp Directory", )
              </SettingsFieldLabel>
            }
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
            label={
              <SettingsFieldLabel
                info={t(
                  "admin.settings.advanced.tempFileManagement.prefix.description",
                  "Prefix for temp file names",
                )}
              >
                t( "admin.settings.advanced.tempFileManagement.prefix.label",
                "Temp File Prefix", )
              </SettingsFieldLabel>
            }
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
            label={
              <SettingsFieldLabel
                info={t(
                  "admin.settings.advanced.tempFileManagement.maxAgeHours.description",
                  "Maximum age in hours before temp files are cleaned up",
                )}
              >
                t(
                "admin.settings.advanced.tempFileManagement.maxAgeHours.label",
                "Max Age (hours)", )
              </SettingsFieldLabel>
            }
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
            label={
              <SettingsFieldLabel
                info={t(
                  "admin.settings.advanced.tempFileManagement.cleanupIntervalMinutes.description",
                  "How often to run cleanup (in minutes)",
                )}
              >
                t(
                "admin.settings.advanced.tempFileManagement.cleanupIntervalMinutes.label",
                "Cleanup Interval (minutes)", )
              </SettingsFieldLabel>
            }
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

        <SettingsToggleRow
          label={t(
            "admin.settings.advanced.tempFileManagement.startupCleanup.label",
            "Startup Cleanup",
          )}
          info={t(
            "admin.settings.advanced.tempFileManagement.startupCleanup.description",
            "Clean up old temp files on application startup",
          )}
          pending={isFieldPending("tempFileManagement.startupCleanup")}
          checked={settings.tempFileManagement?.startupCleanup ?? true}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              tempFileManagement: {
                ...settings.tempFileManagement,
                startupCleanup: checked,
              },
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.advanced.tempFileManagement.cleanupSystemTemp.label",
            "Cleanup System Temp",
          )}
          info={t(
            "admin.settings.advanced.tempFileManagement.cleanupSystemTemp.description",
            "Whether to clean broader system temp directory (use with caution)",
          )}
          pending={isFieldPending("tempFileManagement.cleanupSystemTemp")}
          checked={settings.tempFileManagement?.cleanupSystemTemp ?? false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              tempFileManagement: {
                ...settings.tempFileManagement,
                cleanupSystemTemp: checked,
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
