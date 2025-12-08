import { SignatureValidationFileResult, SignatureValidationReportEntry } from '@app/types/validateSignature';
import { FileContextSelectors } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import type { TFunction } from 'i18next';
import { deriveEntryStatus } from '@app/hooks/tools/validateSignature/utils/reportStatus';

interface BuildReportEntriesOptions {
  results: SignatureValidationFileResult[];
  selectors: FileContextSelectors;
  generatedAt: number;
  t?: TFunction<'translation'>;
}

export const buildReportEntries = ({
  results,
  selectors,
  generatedAt,
  t,
}: BuildReportEntriesOptions): SignatureValidationReportEntry[] => {
  return results.map((entry) => {
    const fileId = entry.fileId as FileId;
    const stub = selectors.getStirlingFileStub(fileId);
    const file = selectors.getFile(fileId);

    let createdAtLabel: string | null = null;
    const createdTimestamp = stub?.createdAt ?? null;
    if (createdTimestamp) {
      createdAtLabel = new Date(createdTimestamp).toLocaleString();
    }

    const fileSize = file?.size ?? stub?.size ?? entry.fileSize ?? null;
    const lastModified = file?.lastModified ?? stub?.lastModified ?? entry.lastModified ?? null;

    const statusMeta = t ? deriveEntryStatus(entry, t) : null;

    return {
      ...entry,
      thumbnailUrl: stub?.thumbnailUrl ?? null,
      fileSize,
      lastModified,
      createdAtLabel,
      summaryGeneratedAt: generatedAt,
      statusText: statusMeta?.text ?? null,
    };
  });
};
