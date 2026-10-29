import { StirlingFileStub } from "@editor/types/fileContext";
import { useIndexedDBThumbnail } from "@editor/hooks/useIndexedDBThumbnail";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { useRightsManagedThumbnail } from "@editor/hooks/useRightsManagedPdf";

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
  const decrypted = useRightsManagedThumbnail(fileStub?.id);
  const thumbnail = isEncrypted
    ? null
    : decrypted || fileStub?.thumbnailUrl || indexedDBThumb || null;
  return { isEncrypted, thumbnail, isGenerating };
}
