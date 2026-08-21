import { StirlingFileStub } from "@app/types/fileContext";
import { useIndexedDBThumbnail } from "@app/hooks/useIndexedDBThumbnail";

export function useFileThumbnail(
  fileStub: StirlingFileStub | null | undefined,
): {
  isEncrypted: boolean;
  thumbnail: string | null;
  isGenerating: boolean;
} {
  const isEncrypted = Boolean(fileStub?.processedFile?.isEncrypted);
  const { thumbnail: indexedDBThumb, isGenerating } = useIndexedDBThumbnail(
    isEncrypted ? null : fileStub,
  );
  const thumbnail = isEncrypted
    ? null
    : fileStub?.thumbnailUrl || indexedDBThumb || null;
  return { isEncrypted, thumbnail, isGenerating };
}
