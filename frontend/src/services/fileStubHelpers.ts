import { StirlingFile, StirlingFileStub } from '../types/fileContext';
import { createChildStub, generateProcessedFileMetadata } from '../contexts/file/fileActions';
import { createStirlingFile } from '../types/fileContext';
import { ToolId } from '../types/toolId';

/**
 * Create StirlingFiles and StirlingFileStubs from exported files
 * Used when saving page editor changes to create version history
 */
export async function createStirlingFilesAndStubs(
  files: File[],
  parentStub: StirlingFileStub,
  toolId: ToolId
): Promise<{ stirlingFiles: StirlingFile[], stubs: StirlingFileStub[] }> {
  const stirlingFiles: StirlingFile[] = [];
  const stubs: StirlingFileStub[] = [];

  for (const file of files) {
    const processedFileMetadata = await generateProcessedFileMetadata(file);
    const childStub = createChildStub(
      parentStub,
      { toolId, timestamp: Date.now() },
      file,
      processedFileMetadata?.thumbnailUrl,
      processedFileMetadata
    );

    const stirlingFile = createStirlingFile(file, childStub.id);
    stirlingFiles.push(stirlingFile);
    stubs.push(childStub);
  }

  return { stirlingFiles, stubs };
}
