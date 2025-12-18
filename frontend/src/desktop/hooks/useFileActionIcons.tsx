import React from 'react';
import LocalIcon from '@app/components/shared/LocalIcon';

// Type for icon wrapper props (matches MUI fontSize convention)
interface FileActionIconProps {
  fontSize?: 'small' | 'medium' | 'large';
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

// Type for icon wrapper component
type FileActionIconComponent = React.FC<FileActionIconProps>;

/**
 * File action icons for desktop builds
 * Overrides core implementation with desktop-appropriate icons
 */
export function useFileActionIcons() {
  // Create wrapper components for LocalIcon that match the MUI icon interface
  const FolderOpenIcon: FileActionIconComponent = (props) => {
    const size = props.fontSize === 'small' ? 20 : 24;
    return <LocalIcon icon="folder-open-rounded" width={size} height={size} {...props} />;
  };

  const SaveIcon: FileActionIconComponent = (props) => {
    const size = props.fontSize === 'small' ? 20 : 24;
    return <LocalIcon icon="save-rounded" width={size} height={size} {...props} />;
  };

  return {
    upload: FolderOpenIcon,
    download: SaveIcon,
    uploadIconName: 'folder-open-rounded' as const,
    downloadIconName: 'save-rounded' as const,
  };
}
