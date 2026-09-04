import { useEffect, useId, useState } from "react";
import { Badge, Group, Paper, Select, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import LocalIcon from "@app/components/shared/LocalIcon";
import UpdateModal from "@app/components/shared/UpdateModal";
import { updateService, UpdateSummary } from "@app/services/updateService";
import { useFrontendVersionInfo } from "@app/hooks/useFrontendVersionInfo";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { SoftwareUpdatesCardProps } from "@app/components/shared/config/configSections/preferences/preferencesCardProps";

/**
 * Version information and the update check. The page decides whether this card
 * exists at all, so mounting it is what arms the on-open check.
 */
export function SoftwareUpdatesCard({
  desktopInstall,
  desktopUpdateMode,
}: SoftwareUpdatesCardProps) {
  const { t } = useTranslation();
  const labelIds = useId();
  const updateModeLabelId = `${labelIds}-update-mode`;
  const { config } = useAppConfig();
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(
    null,
  );
  const [updateModalOpened, setUpdateModalOpened] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { appVersion, mismatchVersion } = useFrontendVersionInfo(
    config?.appVersion,
  );
  const frontendVersionLabel = appVersion ?? t("common.loading", "Loading..."); // null = loading, shown only when appVersion !== undefined

  // The version update checks run against: the Tauri app version on desktop,
  // falling back to the backend version.
  const currentVersion = appVersion ?? config?.appVersion ?? null;

  // Check for updates on mount. The card is not rendered at all when the update
  // UI is hidden (SaaS build, managed-disabled desktop), so no call ever fires.
  useEffect(() => {
    if (currentVersion) {
      checkForUpdate();
    }
  }, [currentVersion, config?.machineType]);

  const checkForUpdate = async () => {
    if (!currentVersion) return;

    setCheckingUpdate(true);

    const machineInfo = {
      machineType: config?.machineType ?? "unknown",
      activeSecurity: config?.activeSecurity ?? false,
      licenseType: config?.license ?? "NORMAL",
    };

    const summary = await updateService.getUpdateSummary(
      currentVersion,
      machineInfo,
    );

    if (
      summary?.latest_version &&
      updateService.compareVersions(summary.latest_version, currentVersion) > 0
    ) {
      setUpdateSummary(summary);
    } else {
      setUpdateSummary(null);
    }

    setCheckingUpdate(false);
  };

  // Build desktop install props for the UpdateModal (only when provided by desktop override)
  const desktopInstallProps = desktopInstall?.tauriInstallReady
    ? {
        state: desktopInstall.state,
        progress: desktopInstall.progress,
        errorMessage: desktopInstall.errorMessage,
        canInstall: desktopInstall.canInstall,
        actions: desktopInstall.actions,
      }
    : undefined;

  return (
    <>
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              {t(
                "settings.general.updates.description",
                "Check for updates and view version information",
              )}
            </Text>
            {updateSummary && (
              <Badge
                color={updateSummary.max_priority === "urgent" ? "red" : "blue"}
                variant="filled"
              >
                {updateSummary.max_priority === "urgent"
                  ? t("update.urgentUpdateAvailable", "Urgent Update")
                  : t("update.updateAvailable", "Update Available")}
              </Badge>
            )}
          </Group>
          {appVersion !== undefined && (
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" c="dimmed">
                  {t(
                    "settings.general.updates.currentFrontendVersion",
                    "Current Frontend Version",
                  )}
                  :{" "}
                  <Text component="span" fw={500}>
                    {frontendVersionLabel}
                  </Text>
                </Text>
                {mismatchVersion && (
                  <Text size="sm" c="var(--color-red-dark)" mt={4}>
                    {t(
                      "settings.general.updates.versionMismatch",
                      "Warning: A mismatch has been detected between the client version and the AppConfig version. Using different versions can lead to compatibility issues, errors, and security risks. Please ensure that server and client are using the same version.",
                    )}
                  </Text>
                )}
              </div>
            </Group>
          )}
          <Group justify="space-between" align="center">
            <div>
              {config?.appVersion && (
                <Text size="sm" c="dimmed">
                  {t(
                    "settings.general.updates.currentBackendVersion",
                    "Current Backend Version",
                  )}
                  :{" "}
                  <Text component="span" fw={500}>
                    {config.appVersion}
                  </Text>
                </Text>
              )}
              {updateSummary && (
                <Text size="sm" c="dimmed" mt={4}>
                  {t(
                    "settings.general.updates.latestVersion",
                    "Latest Version",
                  )}
                  :{" "}
                  <Text component="span" fw={500} c="var(--c-accent-text)">
                    {updateSummary.latest_version}
                  </Text>
                </Text>
              )}
            </div>
            <Group gap="sm">
              <Button
                size="sm"
                variant="secondary"
                onClick={checkForUpdate}
                loading={checkingUpdate}
                disabled={!currentVersion}
                leftSection={
                  <LocalIcon
                    icon="refresh-rounded"
                    width="1rem"
                    height="1rem"
                  />
                }
              >
                {t(
                  "settings.general.updates.checkForUpdates",
                  "Check for Updates",
                )}
              </Button>
              {updateSummary && (
                <Button
                  size="sm"
                  accent={
                    updateSummary.max_priority === "urgent"
                      ? "danger"
                      : "default"
                  }
                  onClick={() => setUpdateModalOpened(true)}
                  leftSection={
                    <LocalIcon
                      icon="system-update-alt-rounded"
                      width="1rem"
                      height="1rem"
                    />
                  }
                >
                  {t("settings.general.updates.viewDetails", "View Details")}
                </Button>
              )}
            </Group>
          </Group>

          {/* Desktop-only: update behaviour selector (prompt / auto / disabled).
              Rendered disabled with a "Managed by administrator" hint when the
              mode was pinned by a provisioning file. */}
          {desktopUpdateMode && (
            <Stack gap="xs">
              <Group gap="xs" align="center">
                <Text id={updateModeLabelId} fw={600} size="sm">
                  {t(
                    "settings.general.updates.updateBehavior",
                    "Update behavior",
                  )}
                </Text>
                {desktopUpdateMode.locked && (
                  // `color="gray" variant="light"` rendered as near-invisible
                  // light-on-dark in dark mode. `blue light` has enough
                  // contrast in both themes to read clearly without being
                  // shouty.
                  <Badge color="blue" variant="light" size="sm" radius="sm">
                    {t(
                      "settings.general.updates.managedByAdmin",
                      "Managed by administrator",
                    )}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {desktopUpdateMode.locked
                  ? t(
                      "settings.general.updates.updateBehaviorLockedDescription",
                      "Your administrator has configured how Stirling-PDF handles updates on this machine. Contact them to change this.",
                    )
                  : t(
                      "settings.general.updates.updateBehaviorDescription",
                      "Choose whether to prompt before installing updates, install them automatically, or skip update checks entirely.",
                    )}
              </Text>
              <Select
                aria-labelledby={updateModeLabelId}
                disabled={desktopUpdateMode.locked}
                value={desktopUpdateMode.mode}
                onChange={(value) => {
                  if (!value) return;
                  void desktopUpdateMode.onChange(
                    value as "prompt" | "auto" | "disabled",
                  );
                }}
                data={[
                  {
                    value: "prompt",
                    label: t(
                      "settings.general.updates.modePrompt",
                      "Ask me before installing updates",
                    ),
                  },
                  {
                    value: "auto",
                    label: t(
                      "settings.general.updates.modeAuto",
                      "Install updates automatically",
                    ),
                  },
                  {
                    value: "disabled",
                    label: t(
                      "settings.general.updates.modeDisabled",
                      "Don't check for updates",
                    ),
                  },
                ]}
                maw={360}
                comboboxProps={{
                  withinPortal: true,
                  zIndex: Z_INDEX_OVER_CONFIG_MODAL,
                }}
              />
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Update Modal */}
      {updateSummary && (
        <UpdateModal
          opened={updateModalOpened}
          onClose={() => setUpdateModalOpened(false)}
          onRemindLater={() => {
            localStorage.setItem(
              "stirling-pdf-updater:snoozedUntil",
              String(Date.now() + 24 * 60 * 60 * 1000),
            );
          }}
          currentVersion={appVersion ?? config?.appVersion ?? ""}
          updateSummary={updateSummary}
          machineInfo={{
            machineType: config?.machineType ?? "unknown",
            activeSecurity: config?.activeSecurity ?? false,
            licenseType: config?.license ?? "NORMAL",
          }}
          desktopInstall={desktopInstallProps}
        />
      )}
    </>
  );
}
