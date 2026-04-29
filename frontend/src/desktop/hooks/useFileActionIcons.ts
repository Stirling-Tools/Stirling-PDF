import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";

/**
 * File action icons for desktop builds.
 * Overrides the core implementation with desktop-appropriate icons.
 * The presence of `saveAsIconName` signals RightRail to show the Save As button.
 */
export function useFileActionIcons() {
  return {
    upload: FolderOpenOutlinedIcon,
    download: SaveOutlinedIcon,
    uploadIconName: "folder-rounded" as const,
    downloadIconName: "save-rounded" as const,
    // Returning this icon name causes RightRail to render the Save As button.
    // On desktop, downloadFile() without a localPath shows a native save dialog.
    saveAsIconName: "save-as-rounded" as string | undefined,
  };
}
