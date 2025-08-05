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

export interface FileDetailsProps {
  selectedFiles: FileWithUrl[];
  onOpenFiles: () => void;
}

export interface FileSourceButtonsProps {
  activeSource: FileSource;
  onSourceChange: (source: FileSource) => void;
  onLocalFileClick: () => void;
}