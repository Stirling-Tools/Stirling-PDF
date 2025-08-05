import { FileWithUrl } from '../../../types/file';

export type FileSource = 'recent' | 'local' | 'drive';

export interface FileListItemProps {
  file: FileWithUrl;
  isSelected: boolean;
  isSupported: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDoubleClick?: () => void;
}

