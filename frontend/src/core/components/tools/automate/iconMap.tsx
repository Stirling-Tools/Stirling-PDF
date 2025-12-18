import LocalIcon from '@app/components/shared/LocalIcon';

// Icon wrapper components
const SettingsIcon = (props: any) => <LocalIcon icon="settings-rounded" width={24} height={24} {...props} />;
const CompressIcon = (props: any) => <LocalIcon icon="compress-rounded" width={24} height={24} {...props} />;
const SwapHorizIcon = (props: any) => <LocalIcon icon="swap-horiz-rounded" width={24} height={24} {...props} />;
const CleaningServicesIcon = (props: any) => <LocalIcon icon="cleaning-services-rounded" width={24} height={24} {...props} />;
const CropIcon = (props: any) => <LocalIcon icon="crop-rounded" width={24} height={24} {...props} />;
const TextFieldsIcon = (props: any) => <LocalIcon icon="text-fields-rounded" width={24} height={24} {...props} />;
const PictureAsPdfIcon = (props: any) => <LocalIcon icon="picture-as-pdf-rounded" width={24} height={24} {...props} />;
const EditIcon = (props: any) => <LocalIcon icon="edit-rounded" width={24} height={24} {...props} />;
const DeleteIcon = (props: any) => <LocalIcon icon="delete-rounded" width={24} height={24} {...props} />;
const FolderIcon = (props: any) => <LocalIcon icon="folder-rounded" width={24} height={24} {...props} />;
const CloudIcon = (props: any) => <LocalIcon icon="cloud" width={24} height={24} {...props} />;
const StorageIcon = (props: any) => <LocalIcon icon="storage-rounded" width={24} height={24} {...props} />;
const SearchIcon = (props: any) => <LocalIcon icon="search-rounded" width={24} height={24} {...props} />;
const DownloadIcon = (props: any) => <LocalIcon icon="download-rounded" width={24} height={24} {...props} />;
const UploadIcon = (props: any) => <LocalIcon icon="upload-rounded" width={24} height={24} {...props} />;
const PlayArrowIcon = (props: any) => <LocalIcon icon="play-arrow-rounded" width={24} height={24} {...props} />;
const RotateLeftIcon = (props: any) => <LocalIcon icon="rotate-left-rounded" width={24} height={24} {...props} />;
const RotateRightIcon = (props: any) => <LocalIcon icon="rotate-right-rounded" width={24} height={24} {...props} />;
const VisibilityIcon = (props: any) => <LocalIcon icon="visibility-rounded" width={24} height={24} {...props} />;
const ContentCutIcon = (props: any) => <LocalIcon icon="content-cut-rounded" width={24} height={24} {...props} />;
const ContentCopyIcon = (props: any) => <LocalIcon icon="content-copy-rounded" width={24} height={24} {...props} />;
const WorkIcon = (props: any) => <LocalIcon icon="work" width={24} height={24} {...props} />;
const BuildIcon = (props: any) => <LocalIcon icon="build-rounded" width={24} height={24} {...props} />;
const AutoAwesomeIcon = (props: any) => <LocalIcon icon="auto-awesome-rounded" width={24} height={24} {...props} />;
const SmartToyIcon = (props: any) => <LocalIcon icon="smart-toy-rounded" width={24} height={24} {...props} />;
const CheckIcon = (props: any) => <LocalIcon icon="check-rounded" width={24} height={24} {...props} />;
const SecurityIcon = (props: any) => <LocalIcon icon="security-rounded" width={24} height={24} {...props} />;
const StarIcon = (props: any) => <LocalIcon icon="star-rounded" width={24} height={24} {...props} />;

export const iconMap = {
  SettingsIcon,
  CompressIcon,
  SwapHorizIcon,
  CleaningServicesIcon,
  CropIcon,
  TextFieldsIcon,
  PictureAsPdfIcon,
  EditIcon,
  DeleteIcon,
  FolderIcon,
  CloudIcon,
  StorageIcon,
  SearchIcon,
  DownloadIcon,
  UploadIcon,
  PlayArrowIcon,
  RotateLeftIcon,
  RotateRightIcon,
  VisibilityIcon,
  ContentCutIcon,
  ContentCopyIcon,
  WorkIcon,
  BuildIcon,
  AutoAwesomeIcon,
  SmartToyIcon,
  CheckIcon,
  SecurityIcon,
  StarIcon
};

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
  { value: 'StarIcon', label: 'Star' }
];

export type IconKey = keyof typeof iconMap;