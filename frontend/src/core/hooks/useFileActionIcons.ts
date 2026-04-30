import UploadIcon from "@mui/icons-material/Upload";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

/**
 * File action icons for web builds.
 * Desktop builds override this file via TypeScript path aliases to provide
 * different icons (e.g. Save icon instead of Download, and a Save As icon).
 */
export function useFileActionIcons() {
  return {
    upload: UploadIcon,
    download: DownloadOutlinedIcon,
    uploadIconName: "upload" as const,
    downloadIconName: "download" as const,
    // Web builds do not expose a Save As icon — the button is hidden when this is undefined.
    // Desktop builds override this file and return a real icon name.
    saveAsIconName: undefined as string | undefined,
  };
}
