import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import { getPdfAccess } from "@app/services/pdfPasswordStore";

/** Reports retained protection only for outputs whose security was verified. */
export function PdfProtectionResult({
  files,
  summary,
}: {
  files: File[];
  summary?: string;
}) {
  const { t } = useTranslation();
  usePdfAccess(undefined);
  if (!files.length || !files.every((file) => getPdfAccess(file)?.encrypted))
    return null;
  return (
    <Text size="xs" role="status">
      {summary ??
        t("encryptedPdfUnlock.protectionRetained", "Protection retained")}
    </Text>
  );
}
