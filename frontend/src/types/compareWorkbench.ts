import type { CompareResultData } from './compare';
import type { FileId } from './file';
import type { StirlingFile } from './fileContext';

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
