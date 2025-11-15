import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import { useMediaQuery, useViewportSize } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

import { useChatbot } from '@app/contexts/ChatbotContext';
import { useFileState } from '@app/contexts/FileContext';
import {
  ChatbotMessageResponse,
  ChatbotSessionInfo,
  ChatbotUsageSummary,
  sendChatbotPrompt,
} from '@app/services/chatbotService';
import { useToast } from '@app/components/toast';
import type { StirlingFile } from '@app/types/fileContext';
import { useSidebarContext } from '@app/contexts/SidebarContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  modelUsed?: string;
  createdAt: Date;
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const MAX_PROMPT_CHARS = 4000;
const ALPHA_ACK_KEY = 'stirling.chatbot.alphaAck';

const ChatbotDrawer = () => {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { width: viewportWidth, height: viewportHeight } = useViewportSize();
  const {
    isOpen,
    closeChat,
    preferredFileId,
    setPreferredFileId,
    sessions: preparedSessions,
    requestPreprocessing,
  } = useChatbot();
  const { selectors } = useFileState();
  const { sidebarRefs } = useSidebarContext();
  const { show } = useToast();
  const files = selectors.getFiles();
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const [alphaAccepted, setAlphaAccepted] = useState(false);
  const [runOcr, setRunOcr] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [panelAnchor, setPanelAnchor] = useState<{ right: number; top: number } | null>(null);
  const usageAlertState = useRef<'none' | 'warned' | 'limit'>('none');

  const selectedFile = useMemo<StirlingFile | undefined>(
    () => files.find((file) => file.fileId === selectedFileId),
    [files, selectedFileId]
  );
  const selectedSessionEntry = selectedFileId
          ? preparedSessions[selectedFileId]
          : undefined;
  const sessionStatus = selectedSessionEntry?.status ?? 'idle';
  const sessionError = selectedSessionEntry?.error;
  const sessionInfo: ChatbotSessionInfo | null = selectedSessionEntry?.session ?? null;
  const contextStats =
          selectedSessionEntry?.status === 'ready' && selectedSessionEntry?.characterCount !== undefined
                  ? {
                      pageCount: selectedSessionEntry.pageCount ?? 0,
                      characterCount: selectedSessionEntry.characterCount ?? 0,
                  }
                  : null;
  const preparationWarnings = selectedSessionEntry?.warnings ?? [];
  const derivedStatusMessage = useMemo(() => {
    if (!alphaAccepted) {
      return t('chatbot.autoSyncPrompt', 'Acknowledge the alpha notice to start syncing automatically.');
    }
    if (sessionStatus === 'processing' || isStartingSession) {
      return t('chatbot.status.syncing', 'Preparing document for chat…');
    }
    if (sessionStatus === 'error') {
      return sessionError || t('chatbot.errors.preprocessing', 'Unable to prepare this document.');
    }
    if (sessionStatus === 'unsupported') {
      return sessionError || t('chatbot.errors.unsupported', 'Unsupported document type.');
    }
    return null;
  }, [alphaAccepted, sessionStatus, sessionError, isStartingSession, t]);
  const assistantWarnings = useMemo(
          () => [...preparationWarnings, ...warnings.filter(Boolean)],
          [preparationWarnings, warnings]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const storedAck =
            typeof window !== 'undefined'
                    ? window.localStorage.getItem(ALPHA_ACK_KEY) === 'true'
                    : false;
    setAlphaAccepted(storedAck);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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
    usageAlertState.current = 'none';
    if (sessionInfo) {
      maybeShowUsageWarning(sessionInfo.usageSummary);
    }
  }, [sessionInfo?.sessionId]);

  useEffect(() => {
    setMessages([]);
    setWarnings([]);
  }, [selectedFileId]);

  const maybeShowUsageWarning = (usage?: ChatbotUsageSummary | null) => {
    if (!usage) {
      return;
    }
    if (usage.limitExceeded && usageAlertState.current !== 'limit') {
      usageAlertState.current = 'limit';
      show({
        alertType: 'warning',
        title: t('chatbot.usage.limitReachedTitle', 'Chatbot limit reached'),
        body: t(
          'chatbot.usage.limitReachedBody',
          'You have exceeded the current monthly allocation for the chatbot. Further responses may be throttled.'
        ),
      });
      return;
    }
    if (usage.nearingLimit && usageAlertState.current === 'none') {
      usageAlertState.current = 'warned';
      show({
        alertType: 'warning',
        title: t('chatbot.usage.nearingLimitTitle', 'Approaching usage limit'),
        body: t(
          'chatbot.usage.nearingLimitBody',
          'You are nearing your monthly chatbot allocation. Consider limiting very large requests.'
        ),
      });
    }
  };

  useLayoutEffect(() => {
    if (isMobile || !isOpen) {
      setPanelAnchor(null);
      return;
    }
    const panelEl = sidebarRefs.toolPanelRef.current;
    if (!panelEl) {
      setPanelAnchor(null);
      return;
    }
    const updateAnchor = () => {
      const rect = panelEl.getBoundingClientRect();
      setPanelAnchor({
        right: rect.right,
        top: rect.top,
      });
    };
    updateAnchor();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateAnchor()) : null;
    observer?.observe(panelEl);
    const handleResize = () => updateAnchor();
    window.addEventListener('resize', handleResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [isMobile, isOpen, sidebarRefs.toolPanelRef]);

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

  const handleManualPrepare = async (forceOcr?: boolean) => {
    if (!ensureFileSelected() || !selectedFileId) {
      return;
    }
    setIsStartingSession(true);
    try {
      await requestPreprocessing(selectedFileId, { force: true, forceOcr: forceOcr ?? runOcr });
      usageAlertState.current = 'none';
    } catch (error) {
      console.error('[Chatbot] Failed to prepare document', error);
      show({
        alertType: 'error',
        title: t('chatbot.toasts.failedSessionTitle', 'Could not prepare document'),
        body: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleSendMessage = async () => {
    if (!sessionInfo || sessionStatus !== 'ready') {
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
        allowEscalation: true,
      });
      maybeShowUsageWarning(reply.usageSummary);
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

  const disablePromptInput =
          !sessionInfo || sessionStatus !== 'ready' || isStartingSession || isSendingMessage;
  const canSend = !disablePromptInput && prompt.trim().length > 0;

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      if (canSend) {
        event.preventDefault();
        handleSendMessage();
      }
    }
  };

  const drawerTitle = (
    <Group gap="xs">
      <SmartToyRoundedIcon fontSize="small" />
      <Text fw={600}>{t('chatbot.title', 'Stirling PDF Bot')}</Text>
      <Badge color="yellow" size="sm">{t('chatbot.alphaBadge', 'Alpha')}</Badge>
    </Group>
  );


  const safeViewportWidth =
      viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const safeViewportHeight =
      viewportHeight || (typeof window !== 'undefined' ? window.innerHeight : 900);
  const desktopLeft = !isMobile ? (panelAnchor ? panelAnchor.right + 16 : 280) : undefined;
  const desktopBottom = !isMobile ? 24 : undefined;
  const desktopWidth = !isMobile
      ? Math.min(440, Math.max(320, safeViewportWidth - (desktopLeft ?? 24) - 240))
      : undefined;
  const desktopHeightPx = !isMobile
      ? Math.max(520, Math.min(safeViewportHeight - 48, Math.round(safeViewportHeight * 0.85)))
      : undefined;

  const renderMessageBubble = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    const bubbleColor = isUser ? '#1f7ae0' : '#f3f4f6';
    const textColor = isUser ? '#fff' : '#1f1f1f';

    return (
      <Box
        key={message.id + message.role + message.createdAt.getTime()}
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <Box
          p="sm"
          maw="85%"
          bg={bubbleColor}
          style={{
            borderRadius: 14,
            borderTopRightRadius: isUser ? 4 : 14,
            borderTopLeftRadius: isUser ? 14 : 4,
            boxShadow: '0 2px 12px rgba(16,24,40,0.06)',
          }}
        >
          <Group justify="space-between" mb={4} gap="xs">
            <Text size="xs" c={isUser ? 'rgba(255,255,255,0.8)' : 'dimmed'} tt="uppercase">
              {isUser ? t('chatbot.userLabel', 'You') : t('chatbot.botLabel', 'Stirling Bot')}
            </Text>
            {!isUser && message.confidence !== undefined && (
              <Badge
                size="xs"
                variant="light"
                color={message.confidence >= 0.6 ? 'green' : 'yellow'}
              >
                {t('chatbot.confidence', 'Confidence: {{value}}%', {
                  value: Math.round(message.confidence * 100),
                })}
              </Badge>
            )}
          </Group>
          <Text size="sm" c={textColor} style={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Text>
          {!isUser && message.modelUsed && (
            <Text size="xs" c="dimmed" mt={4}>
              {t('chatbot.modelTag', 'Model: {{name}}', { name: message.modelUsed })}
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={closeChat}
        withCloseButton
        radius="lg"
        overlayProps={{ opacity: 0.5, blur: 2 }}
        fullScreen={isMobile}
        centered={isMobile}
        title={drawerTitle}
        styles={{
          content: {
            width: isMobile ? '100%' : desktopWidth,
            left: isMobile ? undefined : desktopLeft,
            right: isMobile ? 0 : undefined,
            margin: isMobile ? undefined : 0,
            top: isMobile ? undefined : undefined,
            bottom: isMobile ? 0 : desktopBottom,
            position: isMobile ? undefined : 'fixed',
            height: isMobile ? '100%' : desktopHeightPx ? `${desktopHeightPx}px` : '75vh',
            overflow: 'hidden',
          },
          body: {
            paddingTop: 'var(--mantine-spacing-md)',
            paddingBottom: 'var(--mantine-spacing-md)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
        transitionProps={{ transition: 'slide-left', duration: 200 }}
      >
        <Stack gap="sm" h="100%" style={{ minHeight: 0 }}>
        <Box
          p="sm"
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
          }}
        >
          <WarningAmberRoundedIcon fontSize="small" style={{ color: 'var(--text-warning)' }} />
          <Box>
            <Text fw={600}>{t('chatbot.alphaTitle', 'Experimental feature')}</Text>
            <Text size="sm">
              {t(
                'chatbot.alphaDescription',
                'This chatbot is in alpha. It currently ignores images and may produce inaccurate answers.'
              )}
            </Text>
          </Box>
        </Box>

        <Group align="flex-end" justify="space-between" gap="md" wrap="wrap">
          <Select
            label={t('chatbot.fileLabel', 'Document')}
            placeholder={t('chatbot.filePlaceholder', 'Select an uploaded PDF')}
            data={fileOptions}
            value={selectedFileId}
            onChange={(value) => setSelectedFileId(value || undefined)}
            nothingFoundMessage={t('chatbot.noFiles', 'Upload a PDF from File Manager to start chatting.')}
            style={{ flex: '1 1 200px' }}
          />
          <Stack gap={4} style={{ minWidth: 180 }}>
            <Switch
              checked={alphaAccepted}
              onChange={(event) => handleAlphaAccept(event.currentTarget.checked)}
              label={t('chatbot.acceptAlphaLabel', 'I acknowledge this experimental feature')}
            />
            <Switch
              checked={runOcr}
              onChange={(event) => setRunOcr(event.currentTarget.checked)}
              label={t('chatbot.ocrToggle', 'Run OCR before extracting text')}
            />
          </Stack>
        </Group>

        <Button
          fullWidth
          variant="filled"
          leftSection={<RefreshRoundedIcon fontSize="small" />}
          loading={isStartingSession || sessionStatus === 'processing'}
          onClick={() => handleManualPrepare()}
          disabled={!selectedFile || !alphaAccepted || sessionStatus === 'processing'}
        >
          {sessionStatus === 'ready'
            ? t('chatbot.refreshButton', 'Reprocess document')
            : t('chatbot.startButton', 'Prepare document for chat')}
        </Button>

        {derivedStatusMessage && (
          <Box
            p="sm"
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              backgroundColor: 'var(--bg-muted)',
            }}
          >
            <Text
              size="sm"
              c={
                sessionStatus === 'error' || sessionStatus === 'unsupported'
                  ? 'var(--text-warning)'
                  : 'blue'
              }
            >
              {derivedStatusMessage}
            </Text>
          </Box>
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

        <Divider label={t('chatbot.conversationTitle', 'Conversation')} />

        <Box style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea viewportRef={scrollViewportRef} style={{ height: '100%' }}>
            <Stack gap="sm" pr="xs">
              {assistantWarnings.length > 0 &&
                assistantWarnings.map((warning) => (
                  <Box
                    key={warning}
                    p="sm"
                    bg="var(--bg-muted)"
                    style={{ borderRadius: 12, border: '1px dashed var(--border-subtle)' }}
                  >
                    <Group gap="xs" align="flex-start">
                      <WarningAmberRoundedIcon fontSize="small" style={{ color: 'var(--text-warning)' }} />
                      <Text size="sm">{warning}</Text>
                    </Group>
                  </Box>
                ))}
              {messages.length === 0 && (
                <Text size="sm" c="dimmed">
                  {t('chatbot.emptyState', 'Ask a question about your PDF to start the conversation.')}
                </Text>
              )}
              {messages.map(renderMessageBubble)}
            </Stack>
          </ScrollArea>
        </Box>

        <Stack
          gap="xs"
          style={{
            flexShrink: 0,
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '0.75rem',
            background: 'var(--bg-toolbar)',
          }}
        >
          <Textarea
            placeholder={t('chatbot.promptPlaceholder', 'Ask anything about this PDF…')}
            minRows={2}
            autosize
            maxRows={6}
            value={prompt}
            maxLength={MAX_PROMPT_CHARS}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            disabled={disablePromptInput}
            onKeyDown={handlePromptKeyDown}
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
              disabled={!canSend}
            >
              {t('chatbot.sendButton', 'Send')}
            </Button>
          </Group>
        </Stack>
      </Stack>
      </Modal>

    </>
  );
};

export default ChatbotDrawer;
