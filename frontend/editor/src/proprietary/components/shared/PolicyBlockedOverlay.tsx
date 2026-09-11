import { Center, Overlay, Stack, Text, ThemeIcon } from "@mantine/core";
import GppBadOutlinedIcon from "@mui/icons-material/GppBadOutlined";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { useFileManagement } from "@app/contexts/FileContext";
import { usePolicyRecovery } from "@app/hooks/usePolicyRecovery";
import type { FileId } from "@app/types/file";

interface PolicyBlockedOverlayProps {
  /** The blocked file - the target of both recovery actions. */
  fileId: FileId;
  zIndex?: number;
}

/** Terminal recovery panel for a file a required policy blocked. */
export function PolicyBlockedOverlay({
  fileId,
  zIndex = 200,
}: PolicyBlockedOverlayProps) {
  const { t } = useTranslation();
  const { reRunPolicy } = usePolicyRecovery();
  const { removeFiles } = useFileManagement();

  return (
    <Overlay
      color="var(--c-bg)"
      backgroundOpacity={0.9}
      blur={4}
      zIndex={zIndex}
    >
      <Center style={{ height: "100%" }}>
        <Stack align="center" gap="md" w={260}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red">
            <GppBadOutlinedIcon style={{ fontSize: 26 }} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            {t("policy.blockedTitle", "File blocked by a policy")}
          </Text>
          <Text size="xs" c="dimmed" ta="center">
            {t(
              "policy.blockedBody",
              "A required policy failed on this file, so it's blocked. Re-run the policy, or close the file.",
            )}
          </Text>
          <Stack gap="xs" w="100%">
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={() => reRunPolicy(fileId)}
            >
              {t("policy.blockedReRun", "Re-run policy")}
            </Button>
            <Button
              variant="secondary"
              accent="danger"
              size="sm"
              fullWidth
              onClick={() => void removeFiles([fileId], false)}
            >
              {t("policy.blockedClose", "Close file")}
            </Button>
          </Stack>
        </Stack>
      </Center>
    </Overlay>
  );
}
