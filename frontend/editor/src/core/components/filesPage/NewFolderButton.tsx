import type { ReactNode } from "react";
import { Menu, Text, Tooltip } from "@mantine/core";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CloudIcon from "@mui/icons-material/Cloud";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DriveFolderUploadIcon from "@mui/icons-material/DriveFolderUpload";
import { useTranslation } from "react-i18next";

import { Button } from "@app/ui/Button";
import type { FolderId, FolderKind } from "@app/types/folder";

export interface NewFolderButtonProps {
  label: string;
  size?: "sm" | "md";
  /** Set when a folder cannot be created here at all; also the tooltip. */
  disabledReason?: string | null;
  /** Set when only the server destination is unavailable; also its tooltip. */
  serverDisabledReason?: string | null;
  /** A subfolder inherits its parent's kind, so inside one there is no choice. */
  currentFolderId: FolderId | null;
  /** Whether this build can put a directory on screen to be mounted. */
  canAddLocalFolder: boolean;
  onAddLocalFolder: () => void;
  onOpenDialog: (parentId?: FolderId | null, kind?: FolderKind) => void;
}

/**
 * New folder, in the three shapes the destinations allow: blocked with a reason, a
 * plain button where only one destination exists, and a menu where two do. Shared by
 * the header and the empty state, so one label cannot offer two different things.
 */
export function NewFolderButton({
  label,
  size = "sm",
  disabledReason,
  serverDisabledReason,
  currentFolderId,
  canAddLocalFolder,
  onAddLocalFolder,
  onOpenDialog,
}: NewFolderButtonProps): ReactNode {
  const { t } = useTranslation();

  if (disabledReason) {
    return (
      <Tooltip label={disabledReason} withinPortal multiline w={260}>
        {/* Wrapped so the tooltip still opens while the button is disabled. */}
        <span style={{ display: "inline-flex" }}>
          <Button
            variant="secondary"
            size={size}
            leftSection={<CreateNewFolderIcon fontSize="small" />}
            disabled
            style={{ pointerEvents: "auto" }}
          >
            {label}
          </Button>
        </span>
      </Tooltip>
    );
  }

  // Inside a folder the kind is inherited, and on the web the server is the only
  // place a folder can go.
  if (currentFolderId !== null || !canAddLocalFolder) {
    return (
      <Button
        variant="secondary"
        size={size}
        leftSection={<CreateNewFolderIcon fontSize="small" />}
        onClick={() =>
          currentFolderId !== null
            ? onOpenDialog()
            : onOpenDialog(null, "server")
        }
      >
        {label}
      </Button>
    );
  }

  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          variant="secondary"
          size={size}
          leftSection={<CreateNewFolderIcon fontSize="small" />}
          rightSection={<ArrowDropDownIcon fontSize="small" />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={
            <DriveFolderUploadIcon
              fontSize="small"
              style={{ marginRight: "0.3rem" }}
            />
          }
          onClick={onAddLocalFolder}
        >
          {t("filesPage.newFolderMenu.addExisting", "Add local folder")}
        </Menu.Item>
        <Menu.Item
          className="files-page-new-folder-option"
          leftSection={<CloudIcon fontSize="small" />}
          disabled={Boolean(serverDisabledReason)}
          onClick={() => onOpenDialog(null, "server")}
        >
          {t("filesPage.newFolderMenu.server", "New folder on the server")}
          {/* The reason is the caption: a disabled item with no explanation
              reads as broken rather than unavailable. */}
          <Text size="xs" c="dimmed">
            {serverDisabledReason ??
              t(
                "filesPage.newFolderMenu.serverHint",
                "Synced to your account, available wherever you sign in.",
              )}
          </Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
