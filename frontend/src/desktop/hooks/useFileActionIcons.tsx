import LocalIcon from '@app/components/shared/LocalIcon';

/**
 * File action icons for desktop builds
 * Overrides core implementation with desktop-appropriate icons
 */
export function useFileActionIcons() {
  // Create wrapper components for LocalIcon that match the MUI icon interface
  const FolderOpenIcon = (props: any) => <LocalIcon icon="folder-open-rounded" width={props.fontSize === 'small' ? 20 : 24} height={props.fontSize === 'small' ? 20 : 24} {...props} />;
  const SaveIcon = (props: any) => <LocalIcon icon="save-rounded" width={props.fontSize === 'small' ? 20 : 24} height={props.fontSize === 'small' ? 20 : 24} {...props} />;

  return {
    upload: FolderOpenIcon,
    download: SaveIcon,
    uploadIconName: 'folder-open-rounded' as const,
    downloadIconName: 'save-rounded' as const,
  };
}
