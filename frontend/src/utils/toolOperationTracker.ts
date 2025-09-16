import { FileId } from '../types/file';
import { FileOperation } from '../types/fileContext';

/**
 * Creates operation tracking data for FileContext integration
 */
export const createOperation = <TParams = void>(
  operationType: string,
  _params: TParams,
  selectedFiles: File[]
): { operation: FileOperation; operationId: string; fileId: FileId } => {
  const operationId = `${operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const fileId = selectedFiles.map(f => f.name).join(',') as FileId;

  const operation: FileOperation = {
    id: operationId,
    type: operationType,
    timestamp: Date.now(),
    fileIds: selectedFiles.map(f => f.name),
    status: 'pending',
    metadata: {
      originalFileName: selectedFiles[0]?.name,
      fileSize: selectedFiles.reduce((sum, f) => sum + f.size, 0)
    }
  } as any /* FIX ME*/;

  return { operation, operationId, fileId };
};
