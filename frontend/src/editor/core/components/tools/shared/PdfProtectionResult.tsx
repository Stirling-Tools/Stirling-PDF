import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { getPdfAccess } from "@editor/services/pdfAccessService";

/** Reports protection changes only for outputs whose security was verified. */
export function PdfProtectionResult({
  files,
  summary,
}: {
  files: File[];
  summary?: string | null;
}) {
  const { t } = useTranslation();
  usePdfAccess(undefined);
  if (
    summary === null ||
    !files.length ||
    !files.every((file) => {
      const access = getPdfAccess(file);
      return access && (summary || access.encrypted);
    })
  )
    return null;
  return (
    <Text size="xs" role="status">
      {summary ??
        t("encryptedPdfUnlock.protectionRetained", "Protection retained")}
    </Text>
  );
}
