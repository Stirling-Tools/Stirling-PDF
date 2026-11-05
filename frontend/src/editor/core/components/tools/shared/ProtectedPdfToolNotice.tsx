import { Group, Stack, Text } from "@mantine/core";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import { PrivateContent } from "@editor/components/shared/PrivateContent";
import type { StirlingFileStub } from "@editor/types/fileContext";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";

function RemovePasswordAction() {
  const { t } = useTranslation();
  const { handleToolSelect } = useToolWorkflowActions();
  return (
    <Tooltip
      content={t(
        "encryptedPdfUnlock.removePasswordHelp",
        "Open Remove Password to choose which passwords to remove.",
      )}
      position="top"
      maxWidth={230}
      arrow
    >
      <ActionIcon
        variant="tertiary"
        accent="neutral"
        size="sm"
        style={{ flexShrink: 0 }}
        aria-label={t("removePassword.submit", "Remove Password")}
        onClick={() => handleToolSelect("removePassword")}
      >
        <Icon name="lock-open" size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** Protected inputs remain visible in the Files list even when this tool cannot process them. */
export function ProtectedPdfToolNotice({
  files,
}: {
  files: readonly StirlingFileStub[];
}) {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <Stack gap="xs" role="list">
      {files.map((file) => (
        <Group key={file.id} gap={6} wrap="nowrap" role="listitem">
          <Tooltip
            content={t(
              "encryptedPdfUnlock.toolUnavailable",
              "This tool doesn't support encrypted PDFs. Remove the password first.",
            )}
            position="top"
            maxWidth={260}
            arrow
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
            c="dimmed"
            style={{ overflowWrap: "anywhere", minWidth: 0, flex: 1 }}
          >
            <PrivateContent>{file.name}</PrivateContent>
          </Text>
          <RemovePasswordAction />
        </Group>
      ))}
    </Stack>
  );
}
