import { memo, useState } from "react";
import {
  Stack,
  Text,
  Group,
  ScrollArea,
  Checkbox,
  Skeleton,
  Badge,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Button as DSButton } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { FilePicker } from "@app/ui/FilePicker";
import { AttachmentRow } from "@app/components/tools/addAttachments/AttachmentRow";
import { DraftAttachmentRow } from "@app/hooks/tools/addAttachments/useAttachmentManager";

export interface AttachmentManagerUIProps {
  rows: DraftAttachmentRow[];
  hasChanges: boolean;
  pendingChangesCount: number;
  isLoading: boolean;
  isSaving: boolean;
  isDownloading?: boolean;
  activeAction: string | null;
  convertToPdfA3b: boolean;
  disabled?: boolean;
  onStageFiles: (files: File[]) => void;
  onToggleDeleteRow: (id: string) => void;
  onRestoreRow: (id: string) => void;
  onRenameRow: (id: string, newName: string) => void;
  onExtractSingle: (filename: string) => Promise<void>;
  onExtractAllZip: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onDiscardDraft: () => void;
  onConvertToPdfA3bChange: (val: boolean) => void;
}

export const AttachmentManagerUI = memo(function AttachmentManagerUI({
  rows,
  hasChanges,
  pendingChangesCount,
  isLoading,
  isSaving,
  isDownloading: _isDownloading = false,
  activeAction,
  convertToPdfA3b,
  disabled = false,
  onStageFiles,
  onToggleDeleteRow,
  onRestoreRow,
  onRenameRow,
  onExtractSingle,
  onExtractAllZip,
  onSaveDraft,
  onDiscardDraft,
  onConvertToPdfA3bChange,
}: AttachmentManagerUIProps) {
  const { t } = useTranslation();
  const [filterQuery, setFilterQuery] = useState("");

  const filteredRows = rows.filter((r) =>
    r.name.toLowerCase().includes(filterQuery.trim().toLowerCase()),
  );

  return (
    <Stack gap="md">
      {/* TOOLBAR HEADER: TITLE + COUNT BADGE */}
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={600}>
          {t("attachments.listTitle", "Attachments")}
        </Text>
        <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
          {rows.length}
        </Badge>
      </Group>

      {/* FILTER SEARCH INPUT (SHOWN WHEN >3 ATTACHMENTS EXIST) */}
      {rows.length > 3 && (
        <TextInput
          placeholder={t(
            "attachments.filterPlaceholder",
            "Filter attachments...",
          )}
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.currentTarget.value)}
          size="xs"
          leftSection={
            <LocalIcon icon="search-rounded" width={14} height={14} />
          }
          rightSection={
            filterQuery ? (
              <ActionIcon
                size="sm"
                variant="tertiary"
                onClick={() => setFilterQuery("")}
                aria-label={t("cancel", "Cancel")}
              >
                <LocalIcon icon="close-rounded" width={12} height={12} />
              </ActionIcon>
            ) : null
          }
        />
      )}

      {/* ATTACHMENT ROWS LIST */}
      {isLoading ? (
        <Stack gap={6}>
          <Skeleton h={38} radius="sm" />
          <Skeleton h={38} radius="sm" />
        </Stack>
      ) : rows.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {t(
            "attachments.noAttachments",
            "No embedded attachments in this document.",
          )}
        </Text>
      ) : (
        <ScrollArea.Autosize mah={280} type="scroll" offsetScrollbars>
          <Stack gap={6}>
            {filteredRows.map((row) => (
              <AttachmentRow
                key={row.id}
                id={row.id}
                filename={row.name}
                originalName={row.originalName}
                size={row.size}
                kind={row.kind}
                disabled={disabled || isSaving}
                isSaving={isSaving}
                isDownloading={activeAction === `extract-${row.originalName}`}
                onExtractSingle={onExtractSingle}
                onToggleDelete={onToggleDeleteRow}
                onRestore={onRestoreRow}
                onRename={onRenameRow}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}

      {/* EXTRACT ALL — full width below the list */}
      {rows.length > 0 && (
        <DSButton
          size="sm"
          variant="tertiary"
          fullWidth
          leftSection={
            <LocalIcon icon="download-rounded" width={13} height={13} />
          }
          onClick={onExtractAllZip}
          disabled={disabled || isSaving}
          loading={activeAction === "extractAll"}
        >
          {t("attachments.extractAll", "Extract all")}
        </DSButton>
      )}

      {/* ADD ATTACHMENTS BUTTON (USING STANDARD SHARED FILEPICKER) */}
      <FilePicker
        variant="secondary"
        multiple={true}
        disabled={disabled || isSaving}
        leftSection={<LocalIcon icon="upload-rounded" width={16} height={16} />}
        onChange={(files) => {
          if (files && files.length > 0) {
            onStageFiles(files);
          }
        }}
        inputProps={{ id: "attachments-input" }}
        fullWidth
      >
        {t("attachments.addAttachments", "Add attachments...")}
      </FilePicker>

      {/* ADVANCED OPTION — 1 QUIET SINGLE LINE WITH TOOLTIP */}
      <Checkbox
        size="sm"
        label={
          <Group gap={4}>
            <Text size="sm" c="dimmed">
              {t("attachments.convertToPdfA3b", "Convert to PDF/A-3b")}
            </Text>
            <Tooltip
              header={{
                title: t(
                  "attachments.convertToPdfA3bTooltipHeader",
                  "About PDF/A-3b Conversion",
                ),
              }}
              tips={[
                {
                  title: t(
                    "attachments.convertToPdfA3bTooltipTitle",
                    "What it does",
                  ),
                  description: t(
                    "attachments.convertToPdfA3bTooltip",
                    "PDF/A-3b is an archival format ensuring long-term preservation. It allows embedding arbitrary file formats as attachments. Conversion requires Ghostscript and may take longer for large files.",
                  ),
                },
              ]}
              sidebarTooltip={true}
              pinOnClick={true}
            >
              <LocalIcon
                icon="info-outline-rounded"
                width={14}
                height={14}
                style={{ color: "var(--icon-files-color)", cursor: "help" }}
              />
            </Tooltip>
          </Group>
        }
        checked={convertToPdfA3b}
        onChange={(event) =>
          onConvertToPdfA3bChange(event.currentTarget.checked)
        }
        disabled={disabled || isSaving}
      />

      {/* SINGLE SAVE FOOTER */}
      {hasChanges && (
        <Group justify="space-between" align="center" mt="xs">
          <DSButton
            size="sm"
            variant="tertiary"
            onClick={onDiscardDraft}
            disabled={disabled || isSaving}
          >
            {t("attachments.discardChanges", "Discard")}
          </DSButton>
          <DSButton
            size="sm"
            variant="primary"
            onClick={onSaveDraft}
            disabled={disabled || isSaving}
            loading={isSaving}
          >
            {t("attachments.saveChanges", "Save Changes ({{count}})", {
              count: pendingChangesCount,
            })}
          </DSButton>
        </Group>
      )}
    </Stack>
  );
});
