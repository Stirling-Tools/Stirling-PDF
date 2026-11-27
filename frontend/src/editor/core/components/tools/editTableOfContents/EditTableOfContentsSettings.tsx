import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Checkbox,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
} from "@mantine/core";
import { Button as DSButton } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { BookmarkNode } from "@editor/utils/editTableOfContents";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface EditTableOfContentsSettingsProps {
  bookmarks: BookmarkNode[];
  replaceExisting: boolean;
  onReplaceExistingChange: (value: boolean) => void;
  onSelectFiles: () => void;
  onLoadFromPdf: () => void;
  onImportJson: (file: File) => void;
  onImportClipboard: () => void;
  onExportJson: () => void;
  onExportClipboard: () => void;
  isLoading: boolean;
  loadError?: string | null;
  canReadClipboard: boolean;
  canWriteClipboard: boolean;
  disabled?: boolean;
  selectedFileName?: string;
}

interface ActionItemProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  /** Shown under the label while the item is disabled, so the menu says why. */
  unavailableReason?: string;
  /** Disables just this item while its action runs. */
  loading?: boolean;
}

function ActionItem({
  icon,
  label,
  onClick,
  unavailableReason,
  loading = false,
}: ActionItemProps) {
  return (
    <Menu.Item
      leftSection={<Icon name={icon} size="1rem" />}
      onClick={onClick}
      disabled={loading || Boolean(unavailableReason)}
    >
      <Text size="sm">{label}</Text>
      {unavailableReason && (
        <Text size="xs" c="dimmed">
          {unavailableReason}
        </Text>
      )}
    </Menu.Item>
  );
}

/** `busy` shows a spinner on the trigger but leaves the menu open to its other items. */
function ActionMenu({
  label,
  disabled,
  busy = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <DSButton
          variant="secondary"
          rightSection={
            busy ? (
              <Loader size="1em" />
            ) : (
              <Icon name="chevron-down" size="1em" />
            )
          }
          aria-busy={busy || undefined}
          disabled={disabled}
          fullWidth
        >
          {label}
        </DSButton>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

export default function EditTableOfContentsSettings({
  bookmarks,
  replaceExisting,
  onReplaceExistingChange,
  onSelectFiles,
  onLoadFromPdf,
  onImportJson,
  onImportClipboard,
  onExportJson,
  onExportClipboard,
  isLoading,
  loadError,
  canReadClipboard,
  canWriteClipboard,
  disabled,
  selectedFileName,
}: EditTableOfContentsSettingsProps) {
  const { t } = useTranslation();
  // Outside the menu: the dropdown unmounts on item click, which would take an
  // input inside it down before the file dialog reports back.
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const clipboardUnavailable = t(
    "editTableOfContents.actions.clipboardUnavailable",
    "Clipboard access is not available in this browser.",
  );
  const hasBookmarks = bookmarks.length > 0;

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <DSButton
          variant="secondary"
          leftSection={<Icon name="folder" size="1em" />}
          onClick={onSelectFiles}
          fullWidth
        >
          {selectedFileName
            ? t("editTableOfContents.workbench.changeFile", "Change PDF")
            : t("editTableOfContents.workbench.selectFile", "Select PDF")}
        </DSButton>
        {selectedFileName && (
          <Text size="xs" c="dimmed" className={privateContentClassName}>
            {t("editTableOfContents.actions.selectedFile", {
              file: selectedFileName,
            })}
          </Text>
        )}
      </Stack>

      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json"
        hidden
        data-testid="edit-toc-import-json-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onImportJson(file);
        }}
      />

      <Group grow gap="sm">
        <ActionMenu
          label={t("editTableOfContents.actions.importMenu", "Import")}
          disabled={disabled}
          busy={isLoading}
        >
          <ActionItem
            icon="file-text"
            label={t(
              "editTableOfContents.actions.loadFromPdf",
              "Load from selected PDF",
            )}
            onClick={onLoadFromPdf}
            loading={isLoading}
            unavailableReason={
              selectedFileName
                ? undefined
                : t(
                    "editTableOfContents.actions.noFile",
                    "Select a PDF to extract existing bookmarks.",
                  )
            }
          />
          <ActionItem
            icon="upload"
            label={t("editTableOfContents.actions.importJson", "Import JSON")}
            onClick={() => jsonInputRef.current?.click()}
          />
          <ActionItem
            icon="clipboard"
            label={t(
              "editTableOfContents.actions.importClipboard",
              "Paste JSON from clipboard",
            )}
            onClick={onImportClipboard}
            unavailableReason={
              canReadClipboard ? undefined : clipboardUnavailable
            }
          />
        </ActionMenu>
        <ActionMenu
          label={t("editTableOfContents.actions.exportMenu", "Export")}
          disabled={disabled || !hasBookmarks}
        >
          <ActionItem
            icon="download"
            label={t("editTableOfContents.actions.exportJson", "Download JSON")}
            onClick={onExportJson}
          />
          <ActionItem
            icon="copy"
            label={t(
              "editTableOfContents.actions.exportClipboard",
              "Copy JSON to clipboard",
            )}
            onClick={onExportClipboard}
            unavailableReason={
              canWriteClipboard ? undefined : clipboardUnavailable
            }
          />
        </ActionMenu>
      </Group>

      {loadError && (
        <Alert
          color="red"
          radius="md"
          icon={<Icon name="circle-alert" size="1em" />}
        >
          {loadError}
        </Alert>
      )}

      <Checkbox
        checked={replaceExisting}
        onChange={(event) =>
          onReplaceExistingChange(event.currentTarget.checked)
        }
        {...infoLabelProps(
          t(
            "editTableOfContents.settings.replaceExisting",
            "Replace existing bookmarks",
          ),
          t(
            "editTableOfContents.settings.replaceExistingHint",
            "When unchecked, the new outline is appended after the current bookmarks.",
          ),
        )}
        disabled={disabled}
      />
    </Stack>
  );
}
