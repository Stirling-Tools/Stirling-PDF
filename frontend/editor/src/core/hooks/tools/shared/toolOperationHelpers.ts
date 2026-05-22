import {
  StirlingFile,
  FileId,
  StirlingFileStub,
  createStirlingFile,
  ProcessedFileMetadata,
  createNewStirlingFileStub,
} from "@app/types/fileContext";

/**
 * Builds parallel inputFileIds and inputStirlingFileStubs arrays from the valid input files.
 * Falls back to a fresh stub when the file is not found in the current context state
 * (e.g. it was removed between operation start and this point).
 */
export function buildInputTracking(
  validFiles: StirlingFile[],
  selectors: {
    getStirlingFileStub: (id: FileId) => StirlingFileStub | undefined;
  },
): { inputFileIds: FileId[]; inputStirlingFileStubs: StirlingFileStub[] } {
  const inputFileIds: FileId[] = [];
  const inputStirlingFileStubs: StirlingFileStub[] = [];
  for (const file of validFiles) {
    const fileId = file.fileId;
    const record = selectors.getStirlingFileStub(fileId);
    if (record) {
      inputFileIds.push(fileId);
      inputStirlingFileStubs.push(record);
    } else {
      console.warn(`No file stub found for file: ${file.name}`);
      inputFileIds.push(fileId);
      inputStirlingFileStubs.push(createNewStirlingFileStub(file, fileId));
    }
  }
  return { inputFileIds, inputStirlingFileStubs };
}

/**
 * Creates parallel outputStirlingFileStubs and outputStirlingFiles arrays from processed files.
 * The stubFactory determines how each stub is constructed (child version vs fresh root).
 */
export function buildOutputPairs(
  processedFiles: File[],
  thumbnails: string[],
  metadataArray: Array<ProcessedFileMetadata | undefined>,
  stubFactory: (
    file: File,
    thumbnail: string,
    metadata: ProcessedFileMetadata | undefined,
    index: number,
  ) => StirlingFileStub,
): {
  outputStirlingFileStubs: StirlingFileStub[];
  outputStirlingFiles: StirlingFile[];
} {
  const outputStirlingFileStubs = processedFiles.map((file, index) =>
    stubFactory(file, thumbnails[index], metadataArray[index], index),
  );
  const outputStirlingFiles = processedFiles.map((file, index) =>
    createStirlingFile(file, outputStirlingFileStubs[index].id),
  );
  return { outputStirlingFileStubs, outputStirlingFiles };
}
