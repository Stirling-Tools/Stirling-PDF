import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

/**
 * File action icons for desktop builds
 * Overrides core implementation with desktop-appropriate icons
 */
export function useFileActionIcons() {
  return {
    upload: FolderOpenOutlinedIcon,
    download: SaveOutlinedIcon,
    uploadIconName: 'folder-rounded' as const,
    downloadIconName: 'save-rounded' as const,
  };
}
