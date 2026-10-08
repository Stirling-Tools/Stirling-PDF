import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
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
    <Stack
      gap={6}
      p="sm"
      style={{
        border: "1px solid var(--c-border-subtle)",
        borderRadius: "var(--mantine-radius-md)",
      }}
    >
      <Text size="xs" c="dimmed">
        {t(
          "encryptedPdfUnlock.toolUnavailableTitle",
          "Not supported by this tool",
        )}
      </Text>
      <Stack gap={4} role="list">
        {excluded.map((file) => (
          <Group key={file.id} gap={6} wrap="nowrap" role="listitem">
            <Tooltip
              label={t(
                "encryptedPdfUnlock.toolUnavailable",
                "Unlocked for viewing, but this tool cannot preserve its password protection. Use Remove Password to create an unprotected copy first.",
              )}
              multiline
              w={260}
              withArrow
              events={{ hover: true, focus: true, touch: true }}
            >
              <ActionIcon
                variant="quiet"
                accent="warning"
                size="sm"
                aria-label={t(
                  "encryptedPdfUnlock.toolUnavailableDetails",
                  "Why {{name}} is unavailable",
                  { name: file.name },
                )}
                style={{ flexShrink: 0 }}
              >
                <Icon
                  name="triangle-alert"
                  size={16}
                  style={{ color: "var(--c-warning)" }}
                />
              </ActionIcon>
            </Tooltip>
            <Text
              size="sm"
              fw={500}
              style={{ overflowWrap: "anywhere", minWidth: 0 }}
            >
              {file.name}
            </Text>
          </Group>
        ))}
      </Stack>
      <Text size="xs" c="dimmed">
        {t(
          "encryptedPdfUnlock.toolUnavailableAction",
          "Use Remove Password to continue.",
        )}
      </Text>
    </Stack>
  );
}
