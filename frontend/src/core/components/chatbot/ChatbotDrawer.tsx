import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import { useChatbot } from '@app/contexts/ChatbotContext';
import { useFileState } from '@app/contexts/FileContext';
import { extractTextFromPdf } from '@app/services/pdfTextExtractor';
import { runOcrForChat } from '@app/services/chatbotOcrService';
import {
  ChatbotMessageResponse,
  ChatbotSessionInfo,
  createChatbotSession,
  sendChatbotPrompt,
} from '@app/services/chatbotService';
import { useToast } from '@app/components/toast';
import type { StirlingFile } from '@app/types/fileContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  modelUsed?: string;
  createdAt: Date;
}

const ALPHA_ACK_KEY = 'stirling.chatbot.alphaAck';

function createMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const MAX_PROMPT_CHARS = 4000;

const ChatbotDrawer = () => {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { isOpen, closeChat, preferredFileId, setPreferredFileId } = useChatbot();
  const { selectors } = useFileState();
  const { show } = useToast();
  const files = selectors.getFiles();
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const [alphaAccepted, setAlphaAccepted] = useState(false);
  const [runOcr, setRunOcr] = useState(false);
  const [allowEscalation, setAllowEscalation] = useState(true);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [sessionInfo, setSessionInfo] = useState<ChatbotSessionInfo | null>(null);
  const [contextStats, setContextStats] = useState<{ pageCount: number; characterCount: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [noTextModalOpen, setNoTextModalOpen] = useState(false);
  const [pendingOcrRetry, setPendingOcrRetry] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const selectedFile = useMemo<StirlingFile | undefined>(
    () => files.find((file) => file.fileId === selectedFileId),
    [files, selectedFileId]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const storedAck = typeof window !== 'undefined'
      ? window.localStorage.getItem(ALPHA_ACK_KEY) === 'true'
      : false;
    setAlphaAccepted(storedAck);

    if (preferredFileId) {
      setSelectedFileId(preferredFileId);
      setPreferredFileId(undefined);
      return;
    }

    if (!selectedFileId && files.length > 0) {
      setSelectedFileId(files[0].fileId);
    }
  }, [isOpen, preferredFileId, setPreferredFileId, files, selectedFileId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTo({
        top: scrollViewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (sessionInfo && sessionInfo.documentId !== selectedFileId) {
      setSessionInfo(null);
      setContextStats(null);
      setMessages([]);
      setWarnings([]);
    }
  }, [sessionInfo, selectedFileId]);

  const handleAlphaAccept = (checked: boolean) => {
    setAlphaAccepted(checked);
    if (typeof window !== 'undefined') {
      if (checked) {
        window.localStorage.setItem(ALPHA_ACK_KEY, 'true');
      } else {
        window.localStorage.removeItem(ALPHA_ACK_KEY);
      }
    }
  };

  const withStatus = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    setStatusMessage(label);
    try {
      return await fn();
    } finally {
      setStatusMessage('');
    }
  };

  const ensureFileSelected = () => {
    if (!selectedFile) {
      show({
        alertType: 'warning',
      title: t('chatbot.toasts.noFileTitle', 'No PDF selected'),
        body: t('chatbot.toasts.noFileBody', 'Please choose a document before starting the chatbot.'),
      });
      return false;
    }
    return true;
  };

  const handleSessionStart = async (forceOcr?: boolean) => {
    if (!ensureFileSelected() || !selectedFile) {
      return;
    }
    if (!alphaAccepted) {
      show({
        alertType: 'neutral',
        title: t('chatbot.toasts.ackTitle', 'Accept alpha notice'),
        body: t('chatbot.toasts.ackBody', 'Please acknowledge the alpha warning before starting.'),
      });
      return;
    }
    setIsStartingSession(true);
    try {
      let workingFile: File = selectedFile;
      const shouldRunOcr = forceOcr ?? runOcr;

      const extractionResult = await withStatus(
        shouldRunOcr
          ? t('chatbot.status.runningOcr', 'Running OCR and extracting text…')
          : t('chatbot.status.extracting', 'Extracting text from PDF…'),
        async () => {
          if (shouldRunOcr) {
            workingFile = await runOcrForChat(selectedFile);
          }
          return extractTextFromPdf(workingFile);
        }
      );

      if (!extractionResult.text || extractionResult.text.trim().length === 0) {
        setPendingOcrRetry(true);
        setNoTextModalOpen(true);
        return;
      }

      const metadata = {
        name: workingFile.name,
        size: String(workingFile.size),
        pageCount: String(extractionResult.pageCount),
      };

      const sessionPayload = {
        sessionId: sessionInfo?.sessionId,
        documentId: selectedFile.fileId,
        text: extractionResult.text,
        metadata,
        ocrRequested: shouldRunOcr,
        warningsAccepted: alphaAccepted,
      };

      const response = await withStatus(
        t('chatbot.status.syncing', 'Syncing document with Stirling Bot…'),
        () => createChatbotSession(sessionPayload)
      );

      setSessionInfo(response);
      setContextStats({
        pageCount: extractionResult.pageCount,
        characterCount: extractionResult.characterCount,
      });
      setMessages([]);
      setWarnings(response.warnings ?? []);
      setPendingOcrRetry(false);
      setNoTextModalOpen(false);
    } catch (error) {
      console.error('[Chatbot] Failed to start session', error);
      show({
        alertType: 'error',
        title: t('chatbot.toasts.failedSessionTitle', 'Could not prepare document'),
        body: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsStartingSession(false);
      setStatusMessage('');
    }
  };

  const handleSendMessage = async () => {
    if (!sessionInfo) {
      show({
        alertType: 'neutral',
        title: t('chatbot.toasts.noSessionTitle', 'Sync your document first'),
        body: t('chatbot.toasts.noSessionBody', 'Send your PDF to the chatbot before asking questions.'),
      });
      return;
    }
    if (!prompt.trim()) {
      return;
    }
    const trimmedPrompt = prompt.slice(0, MAX_PROMPT_CHARS);
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmedPrompt,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setPrompt('');
    setIsSendingMessage(true);

    try {
      const reply = await sendChatbotPrompt({
        sessionId: sessionInfo.sessionId,
        prompt: trimmedPrompt,
        allowEscalation,
      });
      setWarnings(reply.warnings ?? []);
      const assistant = convertAssistantMessage(reply);
      setMessages((prev) => [...prev, assistant]);
    } catch (error) {
      console.error('[Chatbot] Failed to send prompt', error);
      show({
        alertType: 'error',
        title: t('chatbot.toasts.failedPromptTitle', 'Unable to ask question'),
        body: error instanceof Error ? error.message : String(error),
      });
      // Revert optimistic user message
      setMessages((prev) => prev.filter((message) => message.id !== userMessage.id));
    } finally {
      setIsSendingMessage(false);
    }
  };

  const convertAssistantMessage = (reply: ChatbotMessageResponse): ChatMessage => ({
    id: createMessageId(),
    role: 'assistant',
    content: reply.answer,
    confidence: reply.confidence,
    modelUsed: reply.modelUsed,
    createdAt: new Date(),
  });

  const fileOptions = useMemo(
    () =>
      files.map((file) => ({
        value: file.fileId,
        label: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
      })),
    [files]
  );

  const disablePromptInput = !sessionInfo || isStartingSession || isSendingMessage;

  const drawerTitle = (
    <Group gap="xs">
      <SmartToyRoundedIcon fontSize="small" />
      <Text fw={600}>{t('chatbot.title', 'Stirling PDF Bot')}</Text>
      <Badge color="yellow" size="sm">{t('chatbot.alphaBadge', 'Alpha')}</Badge>
    </Group>
  );

  const assistantWarnings = warnings.filter(Boolean);

  return (
    <Drawer
      opened={isOpen}
      onClose={closeChat}
      position="left"
      overlayProps={{ opacity: 0.65, blur: 3 }}
      size={isMobile ? '100%' : 420}
      title={drawerTitle}
      withinPortal
      closeOnClickOutside={false}
    >
      <Stack gap="md" h="100%">
        <Alert color="yellow" icon={<WarningAmberRoundedIcon fontSize="small" />}
          title={t('chatbot.alphaTitle', 'Experimental feature')}
        >
          {t('chatbot.alphaDescription', 'This chatbot is in alpha. It currently ignores images and may produce inaccurate answers. Your PDF text stays local until you confirm you want to chat.')}
        </Alert>

        <Switch
          checked={alphaAccepted}
          label={t('chatbot.acceptAlphaLabel', 'I understand this feature is experimental and image content is not supported yet.')}
          onChange={(event) => handleAlphaAccept(event.currentTarget.checked)}
        />

        <Select
          label={t('chatbot.fileLabel', 'Document to query')}
          placeholder={t('chatbot.filePlaceholder', 'Select an uploaded PDF')}
          data={fileOptions}
          value={selectedFileId}
          onChange={(value) => setSelectedFileId(value || undefined)}
          nothingFoundMessage={t('chatbot.noFiles', 'Upload a PDF from File Manager to start chatting.')}
        />

        <Group justify="space-between" align="center">
          <Switch
            checked={runOcr}
            onChange={(event) => setRunOcr(event.currentTarget.checked)}
            label={t('chatbot.ocrToggle', 'Run OCR before extracting text (uses more resources)')}
          />
          <Tooltip label={t('chatbot.ocrHint', 'Enable when your PDF is a scan or contains images.')}>
            <ActionIcon variant="subtle" aria-label={t('chatbot.ocrHint', 'OCR hint')}>
              <SmartToyRoundedIcon fontSize="small" />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Button
          fullWidth
          variant="filled"
          leftSection={<RefreshRoundedIcon fontSize="small" />}
          loading={isStartingSession}
          onClick={() => handleSessionStart()}
          disabled={!selectedFile || !alphaAccepted}
        >
          {sessionInfo
            ? t('chatbot.refreshButton', 'Re-sync document')
            : t('chatbot.startButton', 'Send document to chat')}
        </Button>

        {statusMessage && (
          <Alert color="blue">{statusMessage}</Alert>
        )}

        {sessionInfo && contextStats && (
          <Box>
            <Text fw={600}>{t('chatbot.sessionSummary', 'Context summary')}</Text>
            <Text size="sm" c="dimmed">
              {t('chatbot.contextDetails', '{{pages}} pages · {{chars}} characters synced', {
                pages: contextStats.pageCount,
                chars: contextStats.characterCount.toLocaleString(),
              })}
            </Text>
          </Box>
        )}

        {assistantWarnings.length > 0 && (
          <Alert color="yellow">
            <Stack gap={4}>
              {assistantWarnings.map((warning) => (
                <Text key={warning} size="sm">{warning}</Text>
              ))}
            </Stack>
          </Alert>
        )}

        <Divider label={t('chatbot.conversationTitle', 'Conversation')} />

        <ScrollArea viewportRef={scrollViewportRef} style={{ flex: 1 }}>
          <Stack gap="sm" pr="sm">
            {messages.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('chatbot.emptyState', 'Ask a question about your PDF to start the conversation.')}
              </Text>
            )}
            {messages.map((message) => (
              <Box
                key={message.id + message.role + message.createdAt.getTime()}
                p="sm"
                bg={message.role === 'user' ? 'var(--bg-toolbar)' : 'var(--bg-panel)'}
                style={{ borderRadius: 8 }}
              >
                <Group justify="space-between" mb={4} wrap="nowrap">
                  <Text size="xs" c="dimmed" tt="uppercase">
                    {message.role === 'user'
                      ? t('chatbot.userLabel', 'You')
                      : t('chatbot.botLabel', 'Stirling Bot')}
                  </Text>
                  {message.role === 'assistant' && message.confidence !== undefined && (
                    <Badge size="xs" variant="light" color={message.confidence >= 0.6 ? 'green' : 'yellow'}>
                      {t('chatbot.confidence', 'Confidence: {{value}}%', {
                        value: Math.round(message.confidence * 100),
                      })}
                    </Badge>
                  )}
                </Group>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                {message.role === 'assistant' && message.modelUsed && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('chatbot.modelTag', 'Model: {{name}}', { name: message.modelUsed })}
                  </Text>
                )}
              </Box>
            ))}
          </Stack>
        </ScrollArea>

        <Stack gap="xs">
          <Switch
            checked={allowEscalation}
            onChange={(event) => setAllowEscalation(event.currentTarget.checked)}
            label={t('chatbot.escalationToggle', 'Allow upgrade to GPT5-Mini for complex prompts')}
          />
          <Textarea
            placeholder={t('chatbot.promptPlaceholder', 'Ask anything about this PDF…')}
            minRows={3}
            value={prompt}
            maxLength={MAX_PROMPT_CHARS}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            disabled={disablePromptInput}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {t('chatbot.promptCounter', '{{used}} / {{limit}} characters', {
                used: prompt.length,
                limit: MAX_PROMPT_CHARS,
              })}
            </Text>
            <Button
              rightSection={<SendRoundedIcon fontSize="small" />}
              onClick={handleSendMessage}
              loading={isSendingMessage}
              disabled={disablePromptInput || prompt.trim().length === 0}
            >
              {t('chatbot.sendButton', 'Send')}
            </Button>
          </Group>
        </Stack>
      </Stack>

      <Modal
        opened={noTextModalOpen}
        onClose={() => setNoTextModalOpen(false)}
        title={t('chatbot.noTextTitle', 'No text detected in this PDF')}
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            {t('chatbot.noTextBody', 'We could not find selectable text in this document. Would you like to run OCR to convert scanned pages into text?')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" leftSection={<CloseRoundedIcon fontSize="small" />} onClick={() => setNoTextModalOpen(false)}>
              {t('chatbot.noTextDismiss', 'Maybe later')}
            </Button>
            <Button
              leftSection={<SmartToyRoundedIcon fontSize="small" />}
              onClick={() => {
                setNoTextModalOpen(false);
                setRunOcr(true);
                if (pendingOcrRetry) {
                  handleSessionStart(true);
                }
              }}
            >
              {t('chatbot.noTextRunOcr', 'Run OCR and retry')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  );
};

export default ChatbotDrawer;
