import UploadIcon from '@mui/icons-material/Upload';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';

/**
 * File action icons for web builds
 * Desktop builds override this with different icons
 */
export function useFileActionIcons() {
  return {
    upload: UploadIcon,
    download: DownloadOutlinedIcon,
    uploadIconName: 'upload' as const,
    downloadIconName: 'download' as const,
  };
}
