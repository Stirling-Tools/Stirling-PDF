import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useTranslation } from "react-i18next";
import {
  Stack,
  Paper,
  Text,
  Loader,
  Group,
  TextInput,
  Badge,
  Table,
  Tooltip,
  FileInput,
  Alert,
  Box,
  Modal,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { alert } from "@app/components/toast";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LocalIcon from "@app/components/shared/LocalIcon";
import databaseManagementService, {
  DatabaseBackupFile,
} from "@app/services/databaseManagementService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

interface DatabaseBackupsCardProps {
  /** Backups exist only for the embedded H2 database. */
  isEmbeddedH2: boolean;
}

/**
 * Instant CRUD over the H2 backup files: nothing here belongs to the settings
 * draft, so this card owns its own state and never touches Save or Discard.
 */
export function DatabaseBackupsCard({
  isEmbeddedH2,
}: DatabaseBackupsCardProps) {
  const { t } = useTranslation();
  const { loginEnabled, validateLoginEnabled } = useLoginRequired();

  const [backupFiles, setBackupFiles] = useState<DatabaseBackupFile[]>([]);
  const [databaseVersion, setDatabaseVersion] = useState<string | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [importingUpload, setImportingUpload] = useState(false);
  const [importingBackupFile, setImportingBackupFile] = useState<string | null>(
    null,
  );
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<string | null>(
    null,
  );
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmInput, setConfirmInput] = useState("");

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
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? error.response?.data?.message || error.message
        : undefined;
      alert({
        alertType: "error",
        title: t(
          "admin.settings.database.loadError",
          "Failed to load database backups",
        ),
        body: message,
      });
    } finally {
      setBackupsLoading(false);
    }
  };

  // The datasource type and the custom-database switch only reach this card
  // through isEmbeddedH2, so it is the whole of the draft this reload watches.
  useEffect(() => {
    loadBackupData();
  }, [loginEnabled, isEmbeddedH2]);

  const handleCreateBackup = async () => {
    if (!validateLoginEnabled()) return;
    setCreatingBackup(true);
    try {
      await databaseManagementService.createBackup();
      alert({
        alertType: "success",
        title: t(
          "admin.settings.database.backupCreated",
          "Backup created successfully",
        ),
      });
      await loadBackupData();
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? error.response?.data?.message || error.message
        : undefined;
      alert({
        alertType: "error",
        title: t(
          "admin.settings.database.backupFailed",
          "Failed to create backup",
        ),
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
      alert({
        alertType: "success",
        title: t(
          "admin.settings.database.importSuccess",
          "Backup imported successfully",
        ),
      });
      setUploadFile(null);
      await loadBackupData();
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? error.response?.data?.message || error.message
        : undefined;
      alert({
        alertType: "error",
        title: t(
          "admin.settings.database.importFailed",
          "Failed to import backup",
        ),
        body: message,
      });
    } finally {
      setImportingUpload(false);
    }
  };

  const generateConfirmationCode = () => {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.getRandomValues === "function"
    ) {
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
      alert({
        alertType: "warning",
        title: t(
          "admin.settings.database.selectFile",
          "Please select a .sql file to import",
        ),
      });
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
        title: t(
          "admin.settings.database.codeMismatch",
          "Confirmation code does not match",
        ),
        body: t(
          "admin.settings.database.codeMismatchBody",
          "Please enter the code exactly as shown to proceed.",
        ),
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
      alert({
        alertType: "success",
        title: t(
          "admin.settings.database.importSuccess",
          "Backup imported successfully",
        ),
      });
      await loadBackupData();
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? error.response?.data?.message || error.message
        : undefined;
      alert({
        alertType: "error",
        title: t(
          "admin.settings.database.importFailed",
          "Failed to import backup",
        ),
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
      alert({
        alertType: "success",
        title: t("admin.settings.database.deleteSuccess", "Backup deleted"),
      });
      await loadBackupData();
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? error.response?.data?.message || error.message
        : undefined;
      alert({
        alertType: "error",
        title: t(
          "admin.settings.database.deleteFailed",
          "Failed to delete backup",
        ),
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
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? error.response?.data?.message || error.message
        : undefined;
      alert({
        alertType: "error",
        title: t(
          "admin.settings.database.downloadFailed",
          "Failed to download backup",
        ),
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

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            {databaseVersion && (
              <Badge color="blue" variant="light">
                {t("admin.settings.database.version", "H2 Version")}:{" "}
                {databaseVersion}
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
          <Alert
            icon={<LocalIcon icon="info" width="1.2rem" height="1.2rem" />}
            color="yellow"
            radius="md"
          >
            <Text fw={600} size="sm">
              {t(
                "admin.settings.database.h2Only",
                "Backups are available only for the embedded H2 database.",
              )}
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
                  <Text fw={600}>
                    {t(
                      "admin.settings.database.manageBackups",
                      "Manage backups",
                    )}
                  </Text>
                </Group>
                <Group gap="xs">
                  <Button
                    variant="secondary"
                    leftSection={
                      <LocalIcon icon="refresh" width="1rem" height="1rem" />
                    }
                    onClick={loadBackupData}
                    disabled={!loginEnabled || !isEmbeddedH2}
                  >
                    {t("admin.settings.database.refresh", "Refresh")}
                  </Button>
                  <Button
                    leftSection={
                      <LocalIcon icon="upload" width="1rem" height="1rem" />
                    }
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
                    placeholder={t(
                      "admin.settings.database.chooseFile",
                      "Choose a .sql backup file",
                    )}
                    accept=".sql"
                    disabled={!loginEnabled || !isEmbeddedH2}
                    styles={{ input: { minWidth: 280 } }}
                  />
                  <Button
                    variant="secondary"
                    onClick={handleUploadImport}
                    loading={importingUpload}
                    disabled={!loginEnabled || !isEmbeddedH2}
                    leftSection={
                      <LocalIcon
                        icon="play-circle"
                        width="1rem"
                        height="1rem"
                      />
                    }
                  >
                    {t(
                      "admin.settings.database.importFromUpload",
                      "Import upload",
                    )}
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
                    ? t(
                        "admin.settings.database.noBackups",
                        "No backups found yet.",
                      )
                    : t(
                        "admin.settings.database.unavailable",
                        "Backup list unavailable for the current database configuration.",
                      )}
                </Text>
              ) : (
                <Table highlightOnHover withColumnBorders verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>
                        {t("admin.settings.database.fileName", "File")}
                      </Table.Th>
                      <Table.Th>
                        {t("admin.settings.database.created", "Created")}
                      </Table.Th>
                      <Table.Th>
                        {t("admin.settings.database.size", "Size")}
                      </Table.Th>
                      <Table.Th w={150}>
                        {t("admin.settings.database.actions", "Actions")}
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {backupFiles.map((backup) => (
                      <Table.Tr key={backup.fileName}>
                        <Table.Td>{backup.fileName}</Table.Td>
                        <Table.Td>
                          {backup.formattedCreationDate ||
                            backup.creationDate ||
                            "-"}
                        </Table.Td>
                        <Table.Td>{backup.formattedFileSize || "-"}</Table.Td>
                        <Table.Td>
                          <Group gap="xs" justify="flex-start">
                            <Tooltip
                              label={t(
                                "admin.settings.database.download",
                                "Download",
                              )}
                              withArrow
                            >
                              <ActionIcon
                                variant="tertiary"
                                onClick={() => handleDownload(backup.fileName)}
                                disabled={!loginEnabled || !isEmbeddedH2}
                                aria-label={t(
                                  "admin.settings.database.download",
                                  "Download",
                                )}
                              >
                                {downloadingFile === backup.fileName ? (
                                  <Loader size="xs" />
                                ) : (
                                  <LocalIcon
                                    icon="download"
                                    width="1rem"
                                    height="1rem"
                                  />
                                )}
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip
                              label={t(
                                "admin.settings.database.import",
                                "Import",
                              )}
                              withArrow
                            >
                              <ActionIcon
                                variant="tertiary"
                                onClick={() =>
                                  handleImportExisting(backup.fileName)
                                }
                                disabled={!loginEnabled || !isEmbeddedH2}
                                aria-label={t(
                                  "admin.settings.database.import",
                                  "Import",
                                )}
                              >
                                {importingBackupFile === backup.fileName ? (
                                  <Loader size="xs" />
                                ) : (
                                  <LocalIcon
                                    icon="backup"
                                    width="1rem"
                                    height="1rem"
                                  />
                                )}
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip
                              label={t(
                                "admin.settings.database.delete",
                                "Delete",
                              )}
                              withArrow
                            >
                              <ActionIcon
                                variant="tertiary"
                                accent="danger"
                                onClick={() =>
                                  handleDeleteClick(backup.fileName)
                                }
                                disabled={!loginEnabled || !isEmbeddedH2}
                                aria-label={t(
                                  "admin.settings.database.delete",
                                  "Delete",
                                )}
                              >
                                {deletingFile === backup.fileName ? (
                                  <Loader size="xs" />
                                ) : (
                                  <LocalIcon
                                    icon="delete"
                                    width="1rem"
                                    height="1rem"
                                  />
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

      <Modal
        opened={confirmImportOpen}
        onClose={closeConfirmImportModal}
        title={t(
          "admin.settings.database.confirmImportTitle",
          "Confirm database import",
        )}
        centered
        withinPortal
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <Stack gap="md">
          <Alert
            color="red"
            variant="light"
            icon={<LocalIcon icon="warning" width="1.2rem" height="1.2rem" />}
          >
            <Text fw={600}>
              {t(
                "admin.settings.database.overwriteWarning",
                "Warning: This will overwrite the current database.",
              )}
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
              {t(
                "admin.settings.database.confirmCodeLabel",
                "Enter the confirmation code to proceed",
              )}
            </Text>
            <Text size="lg" fw={700}>
              {confirmCode}
            </Text>
            <TextInput
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.currentTarget.value)}
              placeholder={t(
                "admin.settings.database.enterCode",
                "Enter the code shown above",
              )}
              minLength={4}
              maxLength={4}
              disabled={importingUpload}
            />
          </Stack>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="secondary"
              onClick={closeConfirmImportModal}
              disabled={importingUpload}
            >
              {t("cancel", "Cancel")}
            </Button>
            <Button
              accent="danger"
              onClick={handleConfirmImport}
              loading={importingUpload}
              disabled={confirmInput.length === 0}
            >
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
          <Alert
            color="red"
            variant="light"
            icon={<LocalIcon icon="warning" width="1.2rem" height="1.2rem" />}
          >
            <Text fw={600}>
              {t(
                "admin.settings.database.deleteConfirm",
                "Delete this backup? This cannot be undone.",
              )}
            </Text>
            <Text size="sm" c="dimmed">
              {deleteConfirmFile}
            </Text>
          </Alert>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirmFile(null)}
              disabled={deletingFile !== null}
            >
              {t("cancel", "Cancel")}
            </Button>
            <Button
              accent="danger"
              onClick={() =>
                deleteConfirmFile && handleDelete(deleteConfirmFile)
              }
              loading={deletingFile === deleteConfirmFile}
            >
              {t(
                "admin.settings.database.deleteConfirmAction",
                "Delete backup",
              )}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
