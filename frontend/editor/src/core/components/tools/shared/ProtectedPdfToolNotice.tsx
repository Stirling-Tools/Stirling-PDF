import { Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useViewScopedFileStubs } from "@app/hooks/tools/shared/useViewScopedFiles";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import { getPdfAccess } from "@app/services/pdfPasswordStore";
import type { StirlingFile } from "@app/types/fileContext";

/** Explains excluded protected inputs even when the Files step is collapsed. */
export function ProtectedPdfToolNotice({
  eligibleFiles,
}: {
  eligibleFiles: readonly StirlingFile[];
}) {
  usePdfAccess(undefined);
  const { t } = useTranslation();
  const files = useViewScopedFileStubs();
  const excluded = files.filter(
    (file) =>
      file.processedFile?.isEncrypted &&
      getPdfAccess(file.id) &&
      !eligibleFiles.some((eligible) => eligible.fileId === file.id),
  );
  if (!excluded.length) return null;
  return (
    <Alert
      title={t(
        "encryptedPdfUnlock.toolUnavailableTitle",
        "Unlocked for viewing",
      )}
    >
      {t(
        "encryptedPdfUnlock.toolUnavailable",
        "{{names}}: This tool does not yet support processing PDFs while keeping their password protection. Use Remove Password to create an unprotected copy, then run this tool on that copy.",
        { names: excluded.map((file) => file.name).join(", ") },
      )}
    </Alert>
  );
}
