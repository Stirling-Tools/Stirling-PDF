import { useEffect, useRef } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { useTranslation } from 'react-i18next';

import { useChatbot } from '@app/contexts/ChatbotContext';
import { useFileState } from '@app/contexts/FileContext';

const ChatbotAssistant = () => {
  const { t } = useTranslation();
  const { openChat } = useChatbot();
  const { selectors } = useFileState();
  const files = selectors.getFiles();
  const preferredFileId = files[0]?.fileId;
  const hasAutoOpened = useRef(false);

  useEffect(() => {
    if (!hasAutoOpened.current) {
      openChat({ source: 'tool', fileId: preferredFileId });
      hasAutoOpened.current = true;
    }
  }, [openChat, preferredFileId]);

  return (
    <Stack gap="md" p="sm">
      <Alert color="yellow" icon={<WarningAmberRoundedIcon fontSize="small" />}>
        {t('chatbot.toolNotice', 'Chatbot lives inside the main workspace. Use the button below to focus the conversation pane on the left.')}
      </Alert>
      <Text>
        {t('chatbot.toolDescription', 'Ask Stirling Bot questions about any uploaded PDF. The assistant uses your extracted text, so make sure the correct document is selected inside the chat panel.')}
      </Text>
      <Button
        leftSection={<SmartToyRoundedIcon fontSize="small" />}
        onClick={() => openChat({ source: 'tool', fileId: preferredFileId })}
      >
        {t('chatbot.toolOpenButton', 'Open chat window')}
      </Button>
      <Text size="sm" c="dimmed">
        {t('chatbot.toolHint', 'The chat window slides in from the left. If it is already open, this button simply focuses it and passes along the currently selected PDF.')}
      </Text>
    </Stack>
  );
};

export default ChatbotAssistant;
