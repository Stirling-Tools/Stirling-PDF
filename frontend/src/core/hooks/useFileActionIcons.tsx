import LocalIcon from '@app/components/shared/LocalIcon';

/**
 * File action icons for web builds
 * Desktop builds override this with different icons
 */
export function useFileActionIcons() {
  // Create wrapper components for LocalIcon that match the MUI icon interface
  const UploadIcon = (props: any) => <LocalIcon icon="upload-rounded" width={props.fontSize === 'small' ? 20 : 24} height={props.fontSize === 'small' ? 20 : 24} {...props} />;
  const DownloadIcon = (props: any) => <LocalIcon icon="download-rounded" width={props.fontSize === 'small' ? 20 : 24} height={props.fontSize === 'small' ? 20 : 24} {...props} />;

  return {
    upload: UploadIcon,
    download: DownloadIcon,
    uploadIconName: 'upload-rounded' as const,
    downloadIconName: 'download-rounded' as const,
  };
}
