import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import { Button } from "@app/ui/Button";

interface FilesToolbarBulkMenuProps {
  selectedCount: number;
  onAddToWorkspace: () => void;
  /** Local-only files in the selection; omit when there are none to upload. */
  onSaveToServer?: () => void;
  /** Set when storage is off - the item stays listed but disabled. */
  saveToServerDisabledReason?: string;
  onShowDetails?: () => void;
  onMove: () => void;
  onRemove: () => void;
  onClearSelection: () => void;
}

/**
 * Everything that acts on the current selection, behind one trigger. A strip of
 * five buttons only fits the widest viewports, and shrinking it to icons costs
 * every label; one menu reads the same at any width.
 */
export function FilesToolbarBulkMenu({
  selectedCount,
  onAddToWorkspace,
  onSaveToServer,
  saveToServerDisabledReason,
  onShowDetails,
  onMove,
  onRemove,
  onClearSelection,
}: FilesToolbarBulkMenuProps) {
  const { t } = useTranslation();

  const addLabel =
    selectedCount === 1
      ? t("filesPage.addToWorkspace", "Add to workspace")
      : t("filesPage.addToWorkspaceCount", "Add {{count}} to workspace", {
          count: selectedCount,
        });

  return (
    <Menu shadow="md" width={230} position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          size="sm"
          variant="secondary"
          className="files-page-toolbar-bulk-trigger"
          rightSection={<ExpandMoreIcon sx={{ fontSize: "1.1rem" }} />}
          aria-label={t("filesPage.bulkActions", "Actions")}
        >
          {t("filesPage.bulkActions", "Actions")}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<OpenInNewIcon sx={{ fontSize: "1.1rem" }} />}
          onClick={onAddToWorkspace}
        >
          {addLabel}
        </Menu.Item>
        {onSaveToServer && (
          <Menu.Item
            leftSection={<CloudUploadIcon sx={{ fontSize: "1.1rem" }} />}
            disabled={Boolean(saveToServerDisabledReason)}
            onClick={onSaveToServer}
          >
            {t("filesPage.saveToServer", "Save to server")}
          </Menu.Item>
        )}
        {onShowDetails && (
          <Menu.Item
            leftSection={<InfoOutlinedIcon sx={{ fontSize: "1.1rem" }} />}
            onClick={onShowDetails}
          >
            {t("filesPage.showDetails", "Show details")}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<DriveFileMoveIcon sx={{ fontSize: "1.1rem" }} />}
          onClick={onMove}
        >
          {t("filesPage.moveTo", "Move to…")}
        </Menu.Item>
        <Menu.Item
          leftSection={<CloseIcon sx={{ fontSize: "1.1rem" }} />}
          onClick={onClearSelection}
        >
          {t("filesPage.clearSelection", "Clear selection")}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<DeleteIcon sx={{ fontSize: "1.1rem" }} />}
          onClick={onRemove}
        >
          {t("filesPage.remove", "Remove")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default FilesToolbarBulkMenu;
