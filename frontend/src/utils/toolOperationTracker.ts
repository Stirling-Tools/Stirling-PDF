import { FileOperation } from '../types/fileContext';

/**
 * Creates operation tracking data for FileContext integration
 */
export const createOperation = <TParams = void>(
  operationType: string,
  params: TParams,
  selectedFiles: File[]
): { operation: FileOperation; operationId: string; fileId: string } => {
  const operationId = `${operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const fileId = selectedFiles.map(f => f.name).join(',');

  const operation: FileOperation = {
    id: operationId,
    type: operationType,
    timestamp: Date.now(),
    fileIds: selectedFiles.map(f => f.name),
    status: 'pending',
    metadata: {
      originalFileName: selectedFiles[0]?.name,
      parameters: params,
      fileSize: selectedFiles.reduce((sum, f) => sum + f.size, 0)
    }
  };

  return { operation, operationId, fileId };
};