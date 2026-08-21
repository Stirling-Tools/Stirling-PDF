import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Code,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import LocalIcon from "@app/components/shared/LocalIcon";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import apiClient from "@app/services/apiClient";

interface FolderAccessSettingsData {
  allowedFolderRoots?: string[];
}

interface ImpliedFolderRoot {
  path: string;
  reason: string;
}

export default function AdminFolderAccessSection() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } =
    useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<FolderAccessSettingsData>({ sectionName: "policies" });

  const [newRoot, setNewRoot] = useState("");
  const [impliedRoots, setImpliedRoots] = useState<ImpliedFolderRoot[]>([]);

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled]);

  useEffect(() => {
    if (!loginEnabled) return;
    apiClient
      .get<ImpliedFolderRoot[]>(
        "/api/v1/admin/settings/policies/implied-folder-roots",
      )
      .then((res) => setImpliedRoots(res.data ?? []))
      .catch(() => setImpliedRoots([]));
  }, [loginEnabled]);

  const roots = settings.allowedFolderRoots ?? [];

  const reasonLabel = (reason: string) => {
    switch (reason) {
      case "serverStorage":
        return t(
          "admin.settings.folderAccess.implied.serverStorage",
          "Server file storage",
        );
      case "watchedFolder":
        return t(
          "admin.settings.folderAccess.implied.watchedFolder",
          "Pipeline watched folder",
        );
      default:
        return reason;
    }
  };

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

  const setRoots = useCallback(
    (next: string[]) => {
      setSettings({ ...settings, allowedFolderRoots: next });
    },
    [settings, setSettings],
  );

  const addRoot = useCallback(() => {
    const value = newRoot.trim();
    if (!value) return;
    if (roots.includes(value)) {
      setNewRoot("");
      return;
    }
    setRoots([...roots, value]);
    setNewRoot("");
  }, [newRoot, roots, setRoots]);

  const removeRoot = useCallback(
    (value: string) => {
      setRoots(roots.filter((root) => root !== value));
    },
    [roots, setRoots],
  );

  const handleDiscard = useCallback(() => {
    setSettings(resetToSnapshot());
    setNewRoot("");
  }, [resetToSnapshot, setSettings]);

  const handleSave = async () => {
    if (!validateLoginEnabled()) {
      return;
    }
    try {
      await saveSettings();
      markSaved();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    }
  };

  if (loginEnabled && loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <div className="settings-section-container">
      <div className="settings-section-content">
        <Stack gap="sm">
          <LoginRequiredBanner show={!loginEnabled} />
          <div>
            <Group gap="xs" align="center">
              <Text fw={600} size="lg">
                {t("admin.settings.folderAccess.title", "Folder Access")}
              </Text>
              {isFieldPending("allowedFolderRoots") && (
                <PendingBadge show={true} />
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {t(
                "admin.settings.folderAccess.description",
                "Directories that folder sources and folder outputs are allowed to read from and write to. This is a security boundary: automations can never be pointed at a server path outside this list.",
              )}
            </Text>
          </div>

          <Alert variant="light" color="blue">
            <Text size="xs">
              {t(
                "admin.settings.folderAccess.securityNote",
                "Leave this empty to disable folder sources and outputs entirely. Stirling's own configuration directory is always off-limits, and folder access is always disabled in hosted (SaaS) mode.",
              )}
            </Text>
          </Alert>

          <Paper withBorder p="sm" radius="md">
            <Stack gap="sm">
              <div>
                <Text fw={600} size="sm">
                  {t(
                    "admin.settings.folderAccess.roots.label",
                    "Allowed folder roots",
                  )}
                </Text>
                <Text size="xs" c="dimmed">
                  {t(
                    "admin.settings.folderAccess.roots.hint",
                    "Enter absolute paths, for example /data/inbox.",
                  )}
                </Text>
              </div>

              {roots.length === 0 ? (
                <Text size="sm" c="dimmed" fs="italic">
                  {t(
                    "admin.settings.folderAccess.roots.empty",
                    "No folders allowed. Folder sources and outputs are currently disabled.",
                  )}
                </Text>
              ) : (
                <Stack gap="xs">
                  {roots.map((root) => (
                    <Group
                      key={root}
                      justify="space-between"
                      wrap="nowrap"
                      gap="xs"
                    >
                      <Code style={{ wordBreak: "break-all" }}>{root}</Code>
                      <Button
                        variant="tertiary"
                        aria-label={t(
                          "admin.settings.folderAccess.roots.remove",
                          "Remove folder root",
                        )}
                        leftSection={
                          <LocalIcon
                            icon="close-rounded"
                            width="1.1rem"
                            height="1.1rem"
                          />
                        }
                        onClick={() => removeRoot(root)}
                        disabled={!loginEnabled}
                        style={{ flexShrink: 0 }}
                      />
                    </Group>
                  ))}
                </Stack>
              )}

              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  style={{ flex: 1 }}
                  value={newRoot}
                  onChange={(e) => setNewRoot(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRoot();
                    }
                  }}
                  placeholder={t(
                    "admin.settings.folderAccess.roots.placeholder",
                    "/data/inbox",
                  )}
                  disabled={!loginEnabled}
                  styles={getDisabledStyles()}
                />
                <Button
                  variant="secondary"
                  onClick={addRoot}
                  disabled={!loginEnabled || newRoot.trim().length === 0}
                >
                  {t("admin.settings.folderAccess.roots.add", "Add")}
                </Button>
              </Group>
            </Stack>
          </Paper>

          {impliedRoots.length > 0 && (
            <Paper withBorder p="sm" radius="md">
              <Stack gap="sm">
                <div>
                  <Text fw={600} size="sm">
                    {t(
                      "admin.settings.folderAccess.implied.title",
                      "Always allowed",
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(
                      "admin.settings.folderAccess.implied.description",
                      "These Stirling-managed directories are always permitted and can't be changed here.",
                    )}
                  </Text>
                </div>
                <Stack gap="xs">
                  {impliedRoots.map((root) => (
                    <Group
                      key={root.path}
                      justify="space-between"
                      wrap="nowrap"
                      gap="xs"
                      align="center"
                    >
                      <Code style={{ wordBreak: "break-all" }}>
                        {root.path}
                      </Code>
                      <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                        <Text size="xs" c="dimmed">
                          {reasonLabel(root.reason)}
                        </Text>
                        <LocalIcon icon="lock" width="1rem" height="1rem" />
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </Paper>
          )}

          <RestartConfirmationModal
            opened={restartModalOpened}
            onClose={closeRestartModal}
            onRestart={restartServer}
          />
        </Stack>
      </div>
      <SettingsStickyFooter
        isDirty={isDirty}
        saving={saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
