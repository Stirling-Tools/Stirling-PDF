import { Stack, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { usePolicyRecovery } from "@app/hooks/usePolicyRecovery";
import { useFileManagement } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";

interface PolicyBlockedNoticeProps {
  fileIds: readonly FileId[];
  /** Discards a surface's local document after the workbench files close. */
  onClose?: () => void;
}

/** Explains a blocked surface and keeps recovery available outside disabled controls. */
export function PolicyBlockedNotice({
  fileIds,
  onClose,
}: PolicyBlockedNoticeProps) {
  return fileIds.length > 0 ? (
    <BlockedNotice fileIds={fileIds} onClose={onClose} />
  ) : null;
}

function BlockedNotice({ fileIds, onClose }: PolicyBlockedNoticeProps) {
  const { t } = useTranslation();
  const { reRunPolicy } = usePolicyRecovery();
  const { removeFiles } = useFileManagement();
  return (
    <Stack
      role="status"
      gap="xs"
      p="sm"
      style={{
        border: "1px solid var(--c-danger)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <Text size="sm" fw={600}>
        {t("policy.blockedTitle")}
      </Text>
      <Text size="xs">
        {t("policyBlockedFilesBlocked", { count: fileIds.length })}
      </Text>
      <Group gap="xs">
        <Button
          size="sm"
          onClick={() => fileIds.forEach((id) => reRunPolicy(id))}
        >
          {t("policy.blockedReRun")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await removeFiles([...fileIds], false);
            onClose?.();
          }}
        >
          {t("policy.blockedClose")}
        </Button>
      </Group>
    </Stack>
  );
}
