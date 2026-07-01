import { Badge, Button, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { useSigningSessions } from "@app/hooks/signing/useSigningSessions";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";

/**
 * Content for the optional "Request signatures" step in the Sign tool: a short
 * explanation plus a link to the standalone Shared Signing tool. Renders
 * nothing unless group signing is enabled on the server.
 */
export default function SharedSigningLauncher() {
  const { t } = useTranslation();
  const groupSigningEnabled = useGroupSigningEnabled();
  const { handleToolSelect } = useToolWorkflow();

  // Surfaces the count of sign requests awaiting this user's action.
  const { signRequests } = useSigningSessions({
    enabled: groupSigningEnabled,
  });
  const pendingCount = signRequests.filter(
    (req) => req.myStatus !== "SIGNED" && req.myStatus !== "DECLINED",
  ).length;

  if (!groupSigningEnabled) return null;

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t(
          "sign.sharedSigningStepDesc",
          "Send this document to others to sign instead of signing it yourself.",
        )}
      </Text>
      <Button
        fullWidth
        variant="light"
        leftSection={<GroupAddOutlinedIcon sx={{ fontSize: "1.1rem" }} />}
        rightSection={
          pendingCount > 0 ? (
            <Badge size="sm" circle variant="filled" color="red">
              {pendingCount}
            </Badge>
          ) : undefined
        }
        onClick={() => handleToolSelect("sharedSign")}
      >
        {t("sign.sharedSigningOpen", "Open shared signing")}
      </Button>
    </Stack>
  );
}
