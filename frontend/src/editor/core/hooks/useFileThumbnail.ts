import { StirlingFileStub } from "@editor/types/fileContext";
import { useIndexedDBThumbnail } from "@editor/hooks/useIndexedDBThumbnail";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";

export function useFileThumbnail(
  fileStub: StirlingFileStub | null | undefined,
): {
  isEncrypted: boolean;
  thumbnail: string | null;
  isGenerating: boolean;
} {
  const access = usePdfAccess(fileStub?.id);
  const isEncrypted = Boolean(fileStub?.processedFile?.isEncrypted) && !access;
  const { thumbnail: indexedDBThumb, isGenerating } = useIndexedDBThumbnail(
    isEncrypted ? null : fileStub,
  );
  const thumbnail = isEncrypted
    ? null
    : fileStub?.thumbnailUrl || indexedDBThumb || null;
  return { isEncrypted, thumbnail, isGenerating };
}
