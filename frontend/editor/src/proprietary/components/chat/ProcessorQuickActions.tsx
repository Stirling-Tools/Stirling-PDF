import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mantine/core";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RuleIcon from "@mui/icons-material/Rule";
import ScheduleIcon from "@mui/icons-material/Schedule";
import {
  QuickActionCard,
  type QuickAction,
} from "@app/components/chat/ChatQuickActions";

export interface ProcessorQuickActionsProps {
  heading: string;
  onAction: (text: string) => void;
}

/**
 * Quick actions for the processor surface.
 *
 * A separate component rather than a branch inside ChatQuickActions: that one calls
 * useAllFiles/useFileActions/useFilesModalContext, all three of which throw outside the
 * workbench providers. These prompts are all automation-shaped, because document work is
 * refused on this surface.
 */
export function ProcessorQuickActions({
  heading,
  onAction,
}: ProcessorQuickActionsProps) {
  const { t } = useTranslation();

  const actions = useMemo<QuickAction[]>(() => {
    const send = (text: string) => () => onAction(text);
    const stampText = t(
      "chat.processor.quickActions.stampUploads",
      "Stamp every uploaded file with the date it arrived",
    );
    const redactText = t(
      "chat.processor.quickActions.redactPii",
      "Redact personal information before anything is stored",
    );
    const compressText = t(
      "chat.processor.quickActions.compressIncoming",
      "Compress incoming files that are larger than 10 MB",
    );
    return [
      {
        key: "stamp-uploads",
        icon: <ScheduleIcon sx={{ fontSize: 18 }} />,
        title: stampText,
        onClick: send(stampText),
      },
      {
        key: "redact-pii",
        icon: <RuleIcon sx={{ fontSize: 18 }} />,
        title: redactText,
        onClick: send(redactText),
      },
      {
        key: "compress-incoming",
        icon: <AutoAwesomeIcon sx={{ fontSize: 18 }} />,
        title: compressText,
        onClick: send(compressText),
      },
    ];
  }, [t, onAction]);

  return (
    <div className="chat-panel__quick-actions">
      <Text className="chat-panel__quick-actions-label">{heading}</Text>
      <Stack gap="xs">
        {actions.map((action) => (
          <QuickActionCard key={action.key} action={action} />
        ))}
      </Stack>
    </div>
  );
}
