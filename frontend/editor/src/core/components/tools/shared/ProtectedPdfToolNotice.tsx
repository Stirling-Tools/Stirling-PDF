import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import type { StirlingFileStub } from "@app/types/fileContext";
import { useToolWorkflowActions } from "@app/contexts/ToolWorkflowContext";

function RemovePasswordAction() {
  const { t } = useTranslation();
  const { handleToolSelect } = useToolWorkflowActions();
  return (
    <Tooltip
      label={t(
        "encryptedPdfUnlock.removePasswordHelp",
        "Open Remove Password to create an unprotected copy.",
      )}
      multiline
      w={230}
      withArrow
      events={{ hover: true, focus: true, touch: true }}
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
