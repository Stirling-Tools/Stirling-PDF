import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NumberInput,
  Switch,
  Button,
  Stack,
  Paper,
  Text,
  Loader,
  Group,
  TextInput,
  Select,
  Badge,
  Table,
  ActionIcon,
  Tooltip,
  FileInput,
  Alert,
  Divider,
  Box,
  Modal,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import EditableSecretField from "@app/components/shared/EditableSecretField";
import apiClient from "@app/services/apiClient";
import LocalIcon from "@app/components/shared/LocalIcon";
import databaseManagementService, { DatabaseBackupFile } from "@app/services/databaseManagementService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

interface DatabaseSettingsData {
  enableCustomDatabase?: boolean;
  customDatabaseUrl?: string;
  username?: string;
  password?: string;
  type?: string;
  hostName?: string;
  port?: number;
  name?: string;
}

export default function AdminDatabaseSection() {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled, getDisabledStyles } = useLoginRequired();
  const { restartModalOpened, showRestartModal, closeRestartModal, restartServer } = useRestartServer();
  const [backupFiles, setBackupFiles] = useState<DatabaseBackupFile[]>([]);
  const [databaseVersion, setDatabaseVersion] = useState<string | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [importingUpload, setImportingUpload] = useState(false);
  const [importingBackupFile, setImportingBackupFile] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmInput, setConfirmInput] = useState("");

  const { settings, setSettings, loading, saving, fetchSettings, saveSettings, isFieldPending } =
    useAdminSettings<DatabaseSettingsData>({
      sectionName: "database",
      fetchTransformer: async () => {
        const response = await apiClient.get("/api/v1/admin/settings/section/system");
        const systemData = response.data || {};

        // Extract datasource from system response and handle pending
        const datasource = systemData.datasource || {
          enableCustomDatabase: false,
          customDatabaseUrl: "",
          username: "",
          password: "",
          type: "postgresql",
          hostName: "localhost",
          port: 5432,
          name: "postgres",
        };

        // Map pending changes from system._pending.datasource to root level
        const result: any = { ...datasource };
        if (systemData._pending?.datasource) {
          result._pending = systemData._pending.datasource;
        }

        return result;
      },
      saveTransformer: (settings) => {
        // Convert flat settings to dot-notation for delta endpoint
        const deltaSettings: Record<string, any> = {
          "system.datasource.enableCustomDatabase": settings.enableCustomDatabase,
          "system.datasource.customDatabaseUrl": settings.customDatabaseUrl,
          "system.datasource.username": settings.username,
          "system.datasource.password": settings.password,
          "system.datasource.type": settings.type,
          "system.datasource.hostName": settings.hostName,
          "system.datasource.port": settings.port,
          "system.datasource.name": settings.name,
        };

        return {
          sectionData: {},
          deltaSettings,
        };
      },
    });

  useEffect(() => {
    if (loginEnabled) {
      fetchSettings();
    }
  }, [loginEnabled, fetchSettings]);

  const datasourceType = (settings?.type || "").toLowerCase();
  const isCustomDatabase = settings?.enableCustomDatabase === true;
  const isEmbeddedH2 = useMemo(() => {
    if (isCustomDatabase === false) {
      return true;
    }
    if (datasourceType === "h2") {
      return true;
    }
    return false;
  }, [isCustomDatabase, datasourceType]);

  const loadBackupData = async () => {
    if (!loginEnabled || !isEmbeddedH2) {
      setBackupFiles([]);
      setDatabaseVersion(null);
      return;
    }
    setBackupsLoading(true);
    try {
      const data = await databaseManagementService.getDatabaseData();
      setBackupFiles(data.backupFiles || []);
      setDatabaseVersion(data.databaseVersion || null);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      alert({
        alertType: "error",
        title: t("admin.settings.database.loadError", "Failed to load database backups"),
        body: message,
      });
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    loadBackupData();
  }, [loginEnabled, isEmbeddedH2, isCustomDatabase, datasourceType]);

  const handleSave = async () => {
    if (!validateLoginEnabled()) {
      return;
    }

    try {
      await saveSettings();
      showRestartModal();
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    }
  };

  const handleCreateBackup = async () => {
    if (!validateLoginEnabled()) return;
    setCreatingBackup(true);
    try {
      await databaseManagementService.createBackup();
      alert({ alertType: "success", title: t("admin.settings.database.backupCreated", "Backup created successfully") });
      await loadBackupData();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      alert({
        alertType: "error",
        title: t("admin.settings.database.backupFailed", "Failed to create backup"),
        body: message,
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const performUploadImport = async () => {
    if (!uploadFile) return;
    setImportingUpload(true);
    try {
      await databaseManagementService.uploadAndImport(uploadFile);
      alert({ alertType: "success", title: t("admin.settings.database.importSuccess", "Backup imported successfully") });
      setUploadFile(null);
      await loadBackupData();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      alert({
        alertType: "error",
        title: t("admin.settings.database.importFailed", "Failed to import backup"),
        body: message,
      });
    } finally {
      setImportingUpload(false);
    }
  };

  const generateConfirmationCode = () => {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const randomNumber = array[0] % 10000; // 0-9999
      return randomNumber.toString().padStart(4, "0");
    }
    // Fallback: non-cryptographic but avoids Math.random(); this is only a UX safeguard.
    const fallbackNumber = Date.now() % 10000;
    return fallbackNumber.toString().padStart(4, "0");
  };

  const handleUploadImport = () => {
    if (!validateLoginEnabled()) return;
    if (!uploadFile) {
      alert({ alertType: "warning", title: t("admin.settings.database.selectFile", "Please select a .sql file to import") });
      return;
    }
    const code = generateConfirmationCode();
    setConfirmCode(code);
    setConfirmInput("");
    setConfirmImportOpen(true);
  };

  const closeConfirmImportModal = () => {
    setConfirmImportOpen(false);
    setConfirmInput("");
  };

  const handleConfirmImport = async () => {
    if (confirmInput !== confirmCode) {
      alert({
        alertType: "warning",
        title: t("admin.settings.database.codeMismatch", "Confirmation code does not match"),
        body: t("admin.settings.database.codeMismatchBody", "Please enter the code exactly as shown to proceed."),
      });
      return;
    }
    closeConfirmImportModal();
    await performUploadImport();
  };

  const handleImportExisting = async (fileName: string) => {
    if (!validateLoginEnabled()) return;
    setImportingBackupFile(fileName);
    try {
      await databaseManagementService.importFromFileName(fileName);
      alert({ alertType: "success", title: t("admin.settings.database.importSuccess", "Backup imported successfully") });
      await loadBackupData();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      alert({
        alertType: "error",
        title: t("admin.settings.database.importFailed", "Failed to import backup"),
        body: message,
      });
    } finally {
      setImportingBackupFile(null);
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!validateLoginEnabled()) return;
    setDeletingFile(fileName);
    try {
      await databaseManagementService.deleteBackup(fileName);
      alert({ alertType: "success", title: t("admin.settings.database.deleteSuccess", "Backup deleted") });
      await loadBackupData();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      alert({
        alertType: "error",
        title: t("admin.settings.database.deleteFailed", "Failed to delete backup"),
        body: message,
      });
    } finally {
      setDeletingFile(null);
      setDeleteConfirmFile(null);
    }
  };

  const handleDeleteClick = (fileName: string) => {
    if (!validateLoginEnabled()) return;
    setDeleteConfirmFile(fileName);
  };

  const handleDownload = async (fileName: string) => {
    if (!validateLoginEnabled()) return;
    setDownloadingFile(fileName);
    let url: string | null = null;

    const link = document.createElement("a");
    try {
      const blob = await databaseManagementService.downloadBackup(fileName);
      url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message;
      alert({
        alertType: "error",
        title: t("admin.settings.database.downloadFailed", "Failed to download backup"),
        body: message,
      });
    } finally {
      if (link.isConnected) {
        link.remove();
      }
      if (url) {
        window.URL.revokeObjectURL(url);
      }
      setDownloadingFile(null);
    }
  };

  // Override loading state when login is disabled
  const actualLoading = loginEnabled ? loading : false;

  if (actualLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <LoginRequiredBanner show={!loginEnabled} />

      <div>
        <Group justify="space-between" align="center">
          <div>
            <Text fw={600} size="lg">
              {t("admin.settings.database.title", "Database")}
            </Text>
            <Text size="sm" c="dimmed">
              {t(
                "admin.settings.database.description",
                "Configure custom database connection settings for enterprise deployments.",
              )}
            </Text>
          </div>
          <Badge color="grape" size="lg">
            ENTERPRISE
          </Badge>
        </Group>
      </div>

      {/* Database Configuration */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Text fw={600} size="sm" mb="xs">
            {t("admin.settings.database.configuration", "Database Configuration")}
          </Text>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <Text fw={500} size="sm">
                {t("admin.settings.database.enableCustom.label", "Enable Custom Database")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "admin.settings.database.enableCustom.description",
                  "Use your own custom database configuration instead of the default embedded database",
                )}
              </Text>
            </div>
            <Group gap="xs">
              <Switch
                checked={settings?.enableCustomDatabase || false}
                onChange={(e) => {
                  if (!loginEnabled) return;
                  setSettings({ ...settings, enableCustomDatabase: e.target.checked });
                }}
                disabled={!loginEnabled}
                styles={getDisabledStyles()}
              />
              <PendingBadge show={isFieldPending("enableCustomDatabase")} />
            </Group>
          </div>

          {settings?.enableCustomDatabase && (
            <>
              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t("admin.settings.database.customUrl.label", "Custom Database URL")}</span>
                      <PendingBadge show={isFieldPending("customDatabaseUrl")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.database.customUrl.description",
                    "Full JDBC connection string (e.g., jdbc:postgresql://localhost:5432/postgres). If provided, individual connection settings below are not used.",
                  )}
                  value={settings?.customDatabaseUrl || ""}
                  onChange={(e) => setSettings({ ...settings, customDatabaseUrl: e.target.value })}
                  placeholder="jdbc:postgresql://localhost:5432/postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <Select
                  label={
                    <Group gap="xs">
                      <span>{t("admin.settings.database.type.label", "Database Type")}</span>
                      <PendingBadge show={isFieldPending("type")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.database.type.description",
                    "Type of database (not used if custom URL is provided)",
                  )}
                  value={settings?.type || "postgresql"}
                  onChange={(value) => setSettings({ ...settings, type: value || "postgresql" })}
                  data={[
                    { value: "postgresql", label: "PostgreSQL" },
                    { value: "h2", label: "H2" },
                    { value: "mysql", label: "MySQL" },
                    { value: "mariadb", label: "MariaDB" },
                  ]}
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t("admin.settings.database.hostName.label", "Host Name")}</span>
                      <PendingBadge show={isFieldPending("hostName")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.database.hostName.description",
                    "Database server hostname (not used if custom URL is provided)",
                  )}
                  value={settings?.hostName || ""}
                  onChange={(e) => setSettings({ ...settings, hostName: e.target.value })}
                  placeholder="localhost"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <NumberInput
                  label={
                    <Group gap="xs">
                      <span>{t("admin.settings.database.port.label", "Port")}</span>
                      <PendingBadge show={isFieldPending("port")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.database.port.description",
                    "Database server port (not used if custom URL is provided)",
                  )}
                  value={settings?.port || 5432}
                  onChange={(value) => setSettings({ ...settings, port: Number(value) })}
                  min={1}
                  max={65535}
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t("admin.settings.database.name.label", "Database Name")}</span>
                      <PendingBadge show={isFieldPending("name")} />
                    </Group>
                  }
                  description={t(
                    "admin.settings.database.name.description",
                    "Name of the database (not used if custom URL is provided)",
                  )}
                  value={settings?.name || ""}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  placeholder="postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <TextInput
                  label={
                    <Group gap="xs">
                      <span>{t("admin.settings.database.username.label", "Username")}</span>
                      <PendingBadge show={isFieldPending("username")} />
                    </Group>
                  }
                  description={t("admin.settings.database.username.description", "Database authentication username")}
                  value={settings?.username || ""}
                  onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                  placeholder="postgres"
                  disabled={!loginEnabled}
                />
              </div>

              <div>
                <Group gap="xs" align="center" mb={4}>
                  <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{t("admin.settings.database.password.label", "Password")}</span>
                  <PendingBadge show={isFieldPending("password")} />
                </Group>
                <EditableSecretField
                  description={t("admin.settings.database.password.description", "Database authentication password")}
                  value={settings?.password || ""}
                  onChange={(value) => setSettings({ ...settings, password: value })}
                  placeholder="Enter database password"
                  disabled={!loginEnabled}
                />
              </div>
            </>
          )}
        </Stack>
      </Paper>

      {/* Save Button */}
      <Group justify="flex-end">
        <Button onClick={handleSave} loading={saving} size="sm" disabled={!loginEnabled}>
          {t("admin.settings.save", "Save Changes")}
        </Button>
      </Group>

      <Divider my="md" />

      <Stack gap="md">
        <Group justify="space-between" align="center">
          <div>
            <Text fw={600} size="lg">
              {t("admin.settings.database.backupTitle", "Backups & Restore")}
            </Text>
            <Text size="sm" c="dimmed">
              {t("admin.settings.database.backupDescription", "Manage H2 backups directly from the admin console.")}
            </Text>
          </div>
          <Group gap="xs">
            {databaseVersion && (
              <Badge color="blue" variant="light">
                {t("admin.settings.database.version", "H2 Version")}: {databaseVersion}
              </Badge>
            )}
            <Badge color={isEmbeddedH2 ? "green" : "red"} variant="light">
              {isEmbeddedH2
                ? t("admin.settings.database.embedded", "Embedded H2")
                : t("admin.settings.database.external", "External DB")}
            </Badge>
          </Group>
        </Group>

        {!isEmbeddedH2 && (
          <Alert icon={<LocalIcon icon="info" width="1.2rem" height="1.2rem" />} color="yellow" radius="md">
            <Text fw={600} size="sm">
              {t("admin.settings.database.h2Only", "Backups are available only for the embedded H2 database.")}
            </Text>
            <Text size="sm" c="dimmed">
              {t(
                "admin.settings.database.h2Hint",
                "Set the database type to H2 and disable custom database to enable backup and restore.",
              )}
            </Text>
          </Alert>
        )}
        {isEmbeddedH2 && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Group gap="xs">
                  <LocalIcon icon="backup" width="1.4rem" height="1.4rem" />
                  <Text fw={600}>{t("admin.settings.database.manageBackups", "Manage backups")}</Text>
                </Group>
                <Group gap="xs">
                  <Button
                    variant="light"
                    leftSection={<LocalIcon icon="refresh" width="1rem" height="1rem" />}
                    onClick={loadBackupData}
                    disabled={!loginEnabled || !isEmbeddedH2}
                  >
                    {t("admin.settings.database.refresh", "Refresh")}
                  </Button>
                  <Button
                    leftSection={<LocalIcon icon="cloud-upload" width="1rem" height="1rem" />}
                    onClick={handleCreateBackup}
                    loading={creatingBackup}
                    disabled={!loginEnabled || !isEmbeddedH2}
                  >
                    {t("admin.settings.database.createBackup", "Create backup")}
                  </Button>
                </Group>
              </Group>

              <Box>
                <Text fw={500} size="sm" mb={6}>
                  {t("admin.settings.database.uploadTitle", "Upload & import")}
                </Text>
                <Group gap="sm" align="flex-end" wrap="wrap">
                  <FileInput
                    value={uploadFile}
                    onChange={setUploadFile}
                    placeholder={t("admin.settings.database.chooseFile", "Choose a .sql backup file")}
                    accept=".sql"
                    disabled={!loginEnabled || !isEmbeddedH2}
                    styles={{ input: { minWidth: 280 } }}
                  />
                  <Button
                    variant="outline"
                    onClick={handleUploadImport}
                    loading={importingUpload}
                    disabled={!loginEnabled || !isEmbeddedH2}
                    leftSection={<LocalIcon icon="play-circle" width="1rem" height="1rem" />}
                  >
                    {t("admin.settings.database.importFromUpload", "Import upload")}
                  </Button>
                </Group>
              </Box>

              {backupsLoading ? (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              ) : backupFiles.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {isEmbeddedH2
                    ? t("admin.settings.database.noBackups", "No backups found yet.")
                    : t(
                        "admin.settings.database.unavailable",
                        "Backup list unavailable for the current database configuration.",
                      )}
                </Text>
              ) : (
                <Table highlightOnHover withColumnBorders verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("admin.settings.database.fileName", "File")}</Table.Th>
                      <Table.Th>{t("admin.settings.database.created", "Created")}</Table.Th>
                      <Table.Th>{t("admin.settings.database.size", "Size")}</Table.Th>
                      <Table.Th w={150}>{t("admin.settings.database.actions", "Actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {backupFiles.map((backup) => (
                      <Table.Tr key={backup.fileName}>
                        <Table.Td>{backup.fileName}</Table.Td>
                        <Table.Td>{backup.formattedCreationDate || backup.creationDate || "-"}</Table.Td>
                        <Table.Td>{backup.formattedFileSize || "-"}</Table.Td>
                        <Table.Td>
                          <Group gap="xs" justify="flex-start">
                            <Tooltip label={t("admin.settings.database.download", "Download")} withArrow>
                              <ActionIcon
                                variant="subtle"
                                onClick={() => handleDownload(backup.fileName)}
                                disabled={!loginEnabled || !isEmbeddedH2}
                              >
                                {downloadingFile === backup.fileName ? (
                                  <Loader size="xs" />
                                ) : (
                                  <LocalIcon icon="download" width="1rem" height="1rem" />
                                )}
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t("admin.settings.database.import", "Import")} withArrow>
                              <ActionIcon
                                variant="subtle"
                                onClick={() => handleImportExisting(backup.fileName)}
                                disabled={!loginEnabled || !isEmbeddedH2}
                              >
                                {importingBackupFile === backup.fileName ? (
                                  <Loader size="xs" />
                                ) : (
                                  <LocalIcon icon="backup" width="1rem" height="1rem" />
                                )}
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t("admin.settings.database.delete", "Delete")} withArrow>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                onClick={() => handleDeleteClick(backup.fileName)}
                                disabled={!loginEnabled || !isEmbeddedH2}
                              >
                                {deletingFile === backup.fileName ? (
                                  <Loader size="xs" />
                                ) : (
                                  <LocalIcon icon="delete" width="1rem" height="1rem" />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>

      {/* Restart Confirmation Modal */}
      <RestartConfirmationModal opened={restartModalOpened} onClose={closeRestartModal} onRestart={restartServer} />

      <Modal
        opened={confirmImportOpen}
        onClose={closeConfirmImportModal}
        title={t("admin.settings.database.confirmImportTitle", "Confirm database import")}
        centered
        withinPortal
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<LocalIcon icon="warning" width="1.2rem" height="1.2rem" />}>
            <Text fw={600}>
              {t("admin.settings.database.overwriteWarning", "Warning: This will overwrite the current database.")}
            </Text>
            <Text size="sm" c="dimmed">
              {t(
                "admin.settings.database.overwriteWarningBody",
                "All existing data will be replaced by the uploaded backup. This action cannot be undone.",
              )}
            </Text>
          </Alert>
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              {t("admin.settings.database.confirmCodeLabel", "Enter the confirmation code to proceed")}
            </Text>
            <Text size="lg" fw={700}>
              {confirmCode}
            </Text>
            <TextInput
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.currentTarget.value)}
              placeholder={t("admin.settings.database.enterCode", "Enter the code shown above")}
              minLength={4}
              maxLength={4}
              disabled={importingUpload}
            />
          </Stack>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeConfirmImportModal} disabled={importingUpload}>
              {t("cancel", "Cancel")}
            </Button>
            <Button color="red" onClick={handleConfirmImport} loading={importingUpload} disabled={confirmInput.length === 0}>
              {t("admin.settings.database.confirmImport", "Confirm import")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteConfirmFile !== null}
        onClose={() => setDeleteConfirmFile(null)}
        title={t("admin.settings.database.deleteTitle", "Delete backup")}
        centered
        withinPortal
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<LocalIcon icon="warning" width="1.2rem" height="1.2rem" />}>
            <Text fw={600}>
              {t("admin.settings.database.deleteConfirm", "Delete this backup? This cannot be undone.")}
            </Text>
            <Text size="sm" c="dimmed">
              {deleteConfirmFile}
            </Text>
          </Alert>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeleteConfirmFile(null)} disabled={deletingFile !== null}>
              {t("cancel", "Cancel")}
            </Button>
            <Button
              color="red"
              onClick={() => deleteConfirmFile && handleDelete(deleteConfirmFile)}
              loading={deletingFile === deleteConfirmFile}
            >
              {t("admin.settings.database.deleteConfirmAction", "Delete backup")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
