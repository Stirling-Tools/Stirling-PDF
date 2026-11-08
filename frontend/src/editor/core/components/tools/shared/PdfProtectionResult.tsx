import { Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import { Icon } from "@editor/ui/Icon";

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
    <Group gap={6} wrap="nowrap" role="status">
      <Icon name="shield-check" size={14} style={{ flexShrink: 0 }} />
      <Text size="xs">
        {summary ??
          t("encryptedPdfUnlock.protectionRetained", "Protection retained")}
      </Text>
    </Group>
  );
}
