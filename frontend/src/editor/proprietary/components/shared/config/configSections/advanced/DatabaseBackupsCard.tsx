import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@app/ui/Icon";
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
  FileInput,
  Alert,
  Box,
  Modal,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { column, DataTable, type DataTableColumn } from "@app/ui";
import { alert } from "@app/components/toast";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import databaseManagementService, {
  DatabaseBackupFile,
} from "@app/services/databaseManagementService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

interface DatabaseBackupsCardProps {
  /** Backups exist only for the embedded H2 database. */
  isEmbeddedH2: boolean;
}

function H2OnlyNotice() {
  const { t } = useTranslation();
  return (
    <Alert icon={<Icon name="info" size="1.2rem" />} color="yellow" radius="md">
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
  );
}

function BackupsPanel({ children }: { children: ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">{children}</Stack>
    </Paper>
  );
}

interface BackupsHeaderProps {
  databaseVersion: string | null;
  disabled: boolean;
  creating: boolean;
  onRefresh: () => void;
  onCreate: () => void;
}

function BackupsHeader({
  databaseVersion,
  disabled,
  creating,
  onRefresh,
  onCreate,
}: BackupsHeaderProps) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" align="center">
      <Group gap="xs">
        <Icon name="cloud-upload" size="1.4rem" />
        <Text fw={600}>
          {t("admin.settings.database.manageBackups", "Manage backups")}
        </Text>
        <Badge color="green" variant="light" size="sm">
          {t("admin.settings.database.embedded", "Embedded H2")}
        </Badge>
        {databaseVersion && (
          <Badge color="blue" variant="light" size="sm">
            {t("admin.settings.database.version", "H2 Version")}:{" "}
            {databaseVersion}
          </Badge>
        )}
      </Group>
      <Group gap="xs">
        <Button
          variant="secondary"
          leftSection={<Icon name="refresh-cw" size="1rem" />}
          onClick={onRefresh}
          disabled={disabled}
        >
          {t("admin.settings.database.refresh", "Refresh")}
        </Button>
        <Button
          leftSection={<Icon name="upload" size="1rem" />}
          onClick={onCreate}
          loading={creating}
          disabled={disabled}
        >
          {t("admin.settings.database.createBackup", "Create backup")}
        </Button>
      </Group>
    </Group>
  );
}

interface UploadImportFormProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  importing: boolean;
  disabled: boolean;
  onImport: () => void;
}

function UploadImportForm({
  file,
  onFileChange,
  importing,
  disabled,
  onImport,
}: UploadImportFormProps) {
  const { t } = useTranslation();
  return (
    <Box>
      <Text fw={500} size="sm" mb={6}>
        {t("admin.settings.database.uploadTitle", "Upload & import")}
      </Text>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <FileInput
          value={file}
          onChange={onFileChange}
          placeholder={t(
            "admin.settings.database.chooseFile",
            "Choose a .sql backup file",
          )}
          accept=".sql"
          disabled={disabled}
          styles={{ input: { minWidth: 280 } }}
        />
        <Button
          variant="secondary"
          onClick={onImport}
          loading={importing}
          disabled={disabled}
          leftSection={<Icon name="circle-play" size="1rem" />}
        >
          {t("admin.settings.database.importFromUpload", "Import upload")}
        </Button>
      </Group>
    </Box>
  );
}

interface BackupsTableProps {
  backups: DatabaseBackupFile[];
  disabled: boolean;
  downloadingFile: string | null;
  importingFile: string | null;
  deletingFile: string | null;
  onDownload: (fileName: string) => void;
  onImport: (fileName: string) => void;
  onDelete: (fileName: string) => void;
}

function BackupsTable({
  backups,
  disabled,
  downloadingFile,
  importingFile,
  deletingFile,
  onDownload,
  onImport,
  onDelete,
}: BackupsTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<DatabaseBackupFile>[]>(
    () => [
      column.text({
        key: "fileName",
        header: t("admin.settings.database.fileName", "File"),
        get: (b) => b.fileName,
        sortable: true,
      }),
      column.muted({
        key: "created",
        header: t("admin.settings.database.created", "Created"),
        get: (b) => b.formattedCreationDate || b.creationDate,
        sortBy: (b) =>
          b.creationDate ? new Date(b.creationDate).getTime() : undefined,
        placeholder: "-",
        sortable: true,
      }),
      column.muted({
        key: "size",
        header: t("admin.settings.database.size", "Size"),
        get: (b) => b.formattedFileSize,
        sortBy: (b) => b.fileSize,
        placeholder: "-",
        sortable: true,
      }),
      column.actions({
        key: "actions",
        header: t("admin.settings.database.actions", "Actions"),
        get: (b) => [
          {
            label: t("admin.settings.database.download", "Download"),
            glyph: undefined,
            disabled,
            loading: downloadingFile === b.fileName,
            onClick: () => onDownload(b.fileName),
          },
          {
            label: t("admin.settings.database.import", "Import"),
            glyph: undefined,
            disabled,
            loading: importingFile === b.fileName,
            onClick: () => onImport(b.fileName),
          },
          {
            label: t("admin.settings.database.delete", "Delete"),
            glyph: undefined,
            tone: "danger",
            disabled,
            loading: deletingFile === b.fileName,
            onClick: () => onDelete(b.fileName),
          },
        ],
      }),
    ],
    [
      t,
      disabled,
      downloadingFile,
      importingFile,
      deletingFile,
      onDownload,
      onImport,
      onDelete,
    ],
  );

  return (
    <DataTable
      columns={columns}
      rows={backups}
      rowKey={(b) => b.fileName}
      empty={t("admin.settings.database.noBackups", "No backups found yet.")}
      defaultSort={{ key: "created", direction: "desc" }}
    />
  );
}

function BackupList({
  loading,
  ...table
}: BackupsTableProps & { loading: boolean }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }
  if (table.backups.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t("admin.settings.database.noBackups", "No backups found yet.")}
      </Text>
    );
  }
  return <BackupsTable {...table} />;
}

interface ConfirmImportModalProps {
  opened: boolean;
  onClose: () => void;
  code: string;
  input: string;
  onInputChange: (value: string) => void;
  importing: boolean;
  onConfirm: () => void;
}

function ConfirmImportModal({
  opened,
  onClose,
  code,
  input,
  onInputChange,
  importing,
  onConfirm,
}: ConfirmImportModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
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
          icon={<Icon name="triangle-alert" size="1.2rem" />}
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
            {code}
          </Text>
          <TextInput
            value={input}
            onChange={(e) => onInputChange(e.currentTarget.value)}
            placeholder={t(
              "admin.settings.database.enterCode",
              "Enter the code shown above",
            )}
            minLength={4}
            maxLength={4}
            disabled={importing}
          />
        </Stack>
        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            {t("cancel", "Cancel")}
          </Button>
          <Button
            accent="danger"
            onClick={onConfirm}
            loading={importing}
            disabled={input.length === 0}
          >
            {t("admin.settings.database.confirmImport", "Confirm import")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface DeleteBackupModalProps {
  /** The backup awaiting confirmation; null keeps the modal closed. */
  fileName: string | null;
  deletingFile: string | null;
  onClose: () => void;
  onConfirm: (fileName: string) => void;
}

function DeleteBackupModal({
  fileName,
  deletingFile,
  onClose,
  onConfirm,
}: DeleteBackupModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={fileName !== null}
      onClose={onClose}
      title={t("admin.settings.database.deleteTitle", "Delete backup")}
      centered
      withinPortal
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      <Stack gap="md">
        <Alert
          color="red"
          variant="light"
          icon={<Icon name="triangle-alert" size="1.2rem" />}
        >
          <Text fw={600}>
            {t(
              "admin.settings.database.deleteConfirm",
              "Delete this backup? This cannot be undone.",
            )}
          </Text>
          <Text size="sm" c="dimmed">
            {fileName}
          </Text>
        </Alert>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={deletingFile !== null}
          >
            {t("cancel", "Cancel")}
          </Button>
          <Button
            accent="danger"
            onClick={() => fileName && onConfirm(fileName)}
            loading={deletingFile === fileName}
          >
            {t("admin.settings.database.deleteConfirmAction", "Delete backup")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
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

  const actionsDisabled = !loginEnabled || !isEmbeddedH2;

  return (
    <>
      <Stack gap="md">
        {isEmbeddedH2 ? (
          <BackupsPanel>
            <BackupsHeader
              databaseVersion={databaseVersion}
              disabled={actionsDisabled}
              creating={creatingBackup}
              onRefresh={loadBackupData}
              onCreate={handleCreateBackup}
            />
            <UploadImportForm
              file={uploadFile}
              onFileChange={setUploadFile}
              importing={importingUpload}
              disabled={actionsDisabled}
              onImport={handleUploadImport}
            />
            <BackupList
              loading={backupsLoading}
              backups={backupFiles}
              disabled={actionsDisabled}
              downloadingFile={downloadingFile}
              importingFile={importingBackupFile}
              deletingFile={deletingFile}
              onDownload={handleDownload}
              onImport={handleImportExisting}
              onDelete={handleDeleteClick}
            />
          </BackupsPanel>
        ) : (
          <H2OnlyNotice />
        )}
      </Stack>

      <ConfirmImportModal
        opened={confirmImportOpen}
        onClose={closeConfirmImportModal}
        code={confirmCode}
        input={confirmInput}
        onInputChange={setConfirmInput}
        importing={importingUpload}
        onConfirm={handleConfirmImport}
      />

      <DeleteBackupModal
        fileName={deleteConfirmFile}
        deletingFile={deletingFile}
        onClose={() => setDeleteConfirmFile(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
