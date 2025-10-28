import type { CompareResultData } from '@app/types/compare';
import type { FileId } from '@app/types/file';
import type { StirlingFile } from '@app/types/fileContext';

export interface CompareWorkbenchData {
  result: CompareResultData | null;
  baseFileId: FileId | null;
  comparisonFileId: FileId | null;
  onSelectBase?: (fileId: FileId | null) => void;
  onSelectComparison?: (fileId: FileId | null) => void;
  isLoading?: boolean;
  baseLocalFile?: StirlingFile | null;
  comparisonLocalFile?: StirlingFile | null;
}

export interface CompareChangeOption {
  value: string;
  label: string;
  pageNumber: number;
}
