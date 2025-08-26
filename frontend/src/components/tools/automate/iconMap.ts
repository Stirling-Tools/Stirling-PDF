import SettingsIcon from '@mui/icons-material/Settings';
import CompressIcon from '@mui/icons-material/Compress';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import CropIcon from '@mui/icons-material/Crop';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import CloudIcon from '@mui/icons-material/Cloud';
import StorageIcon from '@mui/icons-material/Storage';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WorkIcon from '@mui/icons-material/Work';
import BuildIcon from '@mui/icons-material/Build';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CheckIcon from '@mui/icons-material/Check';
import SecurityIcon from '@mui/icons-material/Security';
import StarIcon from '@mui/icons-material/Star';

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