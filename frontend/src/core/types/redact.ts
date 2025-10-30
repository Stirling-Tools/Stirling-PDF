import type { FileId } from '@app/types/file';
import type { StirlingFile } from '@app/types/fileContext';

export interface ManualRedactionWorkbenchData {
  fileId: FileId;
  file: StirlingFile | null;
  fileName: string;
  onExport?: (file: File) => Promise<void>;
  onExit?: () => void;
  contextId?: string;
}
