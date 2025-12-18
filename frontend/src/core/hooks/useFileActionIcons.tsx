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
 * File action icons for web builds
 * Desktop builds override this with different icons
 */
export function useFileActionIcons() {
  // Create wrapper components for LocalIcon that match the MUI icon interface
  const UploadIcon: FileActionIconComponent = (props) => {
    const size = props.fontSize === 'small' ? 20 : 24;
    return <LocalIcon icon="upload-rounded" width={size} height={size} {...props} />;
  };

  const DownloadIcon: FileActionIconComponent = (props) => {
    const size = props.fontSize === 'small' ? 20 : 24;
    return <LocalIcon icon="download-rounded" width={size} height={size} {...props} />;
  };

  return {
    upload: UploadIcon,
    download: DownloadIcon,
    uploadIconName: 'upload-rounded' as const,
    downloadIconName: 'download-rounded' as const,
  };
}
