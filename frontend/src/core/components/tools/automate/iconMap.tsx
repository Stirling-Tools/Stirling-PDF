import React from 'react';
import LocalIcon from '@app/components/shared/LocalIcon';

// Type for the props that our icon wrapper components accept
interface IconWrapperProps {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

// Type for an icon wrapper component
type IconWrapperComponent = React.FC<IconWrapperProps>;

// Icon configuration: maps component names to Material Symbols icon names
const iconConfig = {
  SettingsIcon: 'settings-rounded',
  CompressIcon: 'compress-rounded',
  SwapHorizIcon: 'swap-horiz-rounded',
  CleaningServicesIcon: 'cleaning-services-rounded',
  CropIcon: 'crop-rounded',
  TextFieldsIcon: 'text-fields-rounded',
  PictureAsPdfIcon: 'picture-as-pdf-rounded',
  EditIcon: 'edit-rounded',
  DeleteIcon: 'delete-rounded',
  FolderIcon: 'folder-rounded',
  CloudIcon: 'cloud',
  StorageIcon: 'storage-rounded',
  SearchIcon: 'search-rounded',
  DownloadIcon: 'download-rounded',
  UploadIcon: 'upload-rounded',
  PlayArrowIcon: 'play-arrow-rounded',
  RotateLeftIcon: 'rotate-left-rounded',
  RotateRightIcon: 'rotate-right-rounded',
  VisibilityIcon: 'visibility-rounded',
  ContentCutIcon: 'content-cut-rounded',
  ContentCopyIcon: 'content-copy-rounded',
  WorkIcon: 'work',
  BuildIcon: 'build-rounded',
  AutoAwesomeIcon: 'auto-awesome-rounded',
  SmartToyIcon: 'smart-toy-rounded',
  CheckIcon: 'check-rounded',
  SecurityIcon: 'security-rounded',
  StarIcon: 'star-rounded',
} as const;

// Factory function to create icon wrapper components
function createIconComponent(iconName: string): IconWrapperComponent {
  return (props: IconWrapperProps) => (
    <LocalIcon icon={iconName} width={24} height={24} {...props} />
  );
}

// Generate the icon map from the configuration
export const iconMap: Record<keyof typeof iconConfig, IconWrapperComponent> =
  Object.entries(iconConfig).reduce(
    (acc, [key, iconName]) => {
      acc[key as keyof typeof iconConfig] = createIconComponent(iconName);
      return acc;
    },
    {} as Record<keyof typeof iconConfig, IconWrapperComponent>
  );

export const iconOptions = [
  { value: 'SettingsIcon', label: 'Settings' },
  { value: 'CompressIcon', label: 'Compress' },
  { value: 'SwapHorizIcon', label: 'Convert' },
  { value: 'CleaningServicesIcon', label: 'Clean' },
  { value: 'CropIcon', label: 'Crop' },
  { value: 'TextFieldsIcon', label: 'Text' },
  { value: 'PictureAsPdfIcon', label: 'PDF' },
  { value: 'EditIcon', label: 'Edit' },
  { value: 'DeleteIcon', label: 'Delete' },
  { value: 'FolderIcon', label: 'Folder' },
  { value: 'CloudIcon', label: 'Cloud' },
  { value: 'StorageIcon', label: 'Storage' },
  { value: 'SearchIcon', label: 'Search' },
  { value: 'DownloadIcon', label: 'Download' },
  { value: 'UploadIcon', label: 'Upload' },
  { value: 'PlayArrowIcon', label: 'Play' },
  { value: 'RotateLeftIcon', label: 'Rotate Left' },
  { value: 'RotateRightIcon', label: 'Rotate Right' },
  { value: 'VisibilityIcon', label: 'View' },
  { value: 'ContentCutIcon', label: 'Cut' },
  { value: 'ContentCopyIcon', label: 'Copy' },
  { value: 'WorkIcon', label: 'Work' },
  { value: 'BuildIcon', label: 'Build' },
  { value: 'AutoAwesomeIcon', label: 'Magic' },
  { value: 'SmartToyIcon', label: 'Robot' },
  { value: 'CheckIcon', label: 'Check' },
  { value: 'SecurityIcon', label: 'Security' },
  { value: 'StarIcon', label: 'Star' },
] as const;

export type IconKey = keyof typeof iconMap;
