import {
  useMemo,
  useRef,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";
import { renderMarkdown } from "@app/components/viewer/nonpdf/MarkdownRenderer";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Box,
  Collapse,
  Group,
  List,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from "@mantine/core";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import {
  useChat,
  AiWorkflowPhase,
  ChatRole,
  isKnownEngineProgressDetail,
  type AiWorkflowProgress,
  type AnyEngineProgressDetail,
} from "@app/components/chat/ChatContext";
import { formatRelativeTime } from "@app/utils/timeUtils";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { StirlingLogoOutline } from "@app/components/agents/StirlingLogoOutline";
import { StirlingLogoAnimated } from "@app/components/agents/StirlingLogoAnimated";
import { ChatQuickActions } from "@app/components/chat/ChatQuickActions";
import "@app/components/chat/ChatPanel.css";

type TranslateFn = ReturnType<typeof useTranslation>["t"];

/** Resolver mapping a tool endpoint path to its translated display name. */
type ToolNameResolver = (endpoint: string) => string | null;

/**
 * Look up a tool's translated name from the tool catalog. The catalog's {@code operationConfig}
 * exposes the full API endpoint path for each tool, so we key the lookup on the exact path that
 * arrives in SSE progress events — no string parsing.
 */
function useToolNameResolver(): ToolNameResolver {
  const { allTools } = useTranslatedToolCatalog();
  return useMemo(() => {
    const nameByEndpoint = new Map<string, string>();
    Object.values(allTools).forEach((tool) => {
      const endpoint = tool.operationConfig?.endpoint;
      if (typeof endpoint === "string") {
        nameByEndpoint.set(endpoint, tool.name);
      }
    });
    return (endpoint: string) => nameByEndpoint.get(endpoint) ?? null;
  }, [allTools]);
}

function formatProgress(
  progress: AiWorkflowProgress,
  t: TranslateFn,
  resolveToolName: ToolNameResolver,
): string {
  if (progress.phase === AiWorkflowPhase.EXECUTING_TOOL && progress.tool) {
    const tool = resolveToolName(progress.tool);
    const hasSteps =
      progress.stepIndex != null &&
      progress.stepCount != null &&
      progress.stepCount > 1;
    if (tool) {
      return hasSteps
        ? t("chat.progress.executing_tool_step", {
            tool,
            step: progress.stepIndex,
            total: progress.stepCount,
          })
        : t("chat.progress.executing_tool_single", { tool });
    }
    return hasSteps
      ? t("chat.progress.executing_tool_generic_step", {
          step: progress.stepIndex,
          total: progress.stepCount,
        })
      : t("chat.progress.executing_tool_generic");
  }
  if (progress.phase === AiWorkflowPhase.ENGINE_PROGRESS) {
    return formatEngineProgress(progress.engineDetail, t);
  }
  return t(`chat.progress.${progress.phase}`);
}

function formatEngineProgress(
  detail: AnyEngineProgressDetail | undefined,
  t: TranslateFn,
): string {
  if (!detail || !isKnownEngineProgressDetail(detail)) {
    return t("chat.progress.processing");
  }
  switch (detail.phase) {
    case "whole_doc_read_started":
      return t("chat.progress.whole_doc_read_started");
    case "whole_doc_slice_done": {
      const percent =
        detail.total > 0
          ? Math.round((detail.completed / detail.total) * 100)
          : 0;
      return t("chat.progress.whole_doc_slice_done", { percent });
    }
    case "whole_doc_compression_round":
      return t("chat.progress.whole_doc_compression_round");
    case "whole_doc_read_done":
      return t("chat.progress.whole_doc_read_done");
  }
}

function ToolsUsedBlock({
  tools,
  resolveToolName,
  t,
}: {
  tools: string[];
  resolveToolName: ToolNameResolver;
  t: TranslateFn;
}) {
  const [expanded, setExpanded] = useState(false);
  const names = tools.map(
    (endpoint) => resolveToolName(endpoint) ?? t("chat.toolsUsed.unknownTool"),
  );
  const label = t("chat.toolsUsed.summary", { count: tools.length });
  return (
    <Box mt={6}>
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Group gap={4} wrap="nowrap">
          {expanded ? (
            <ExpandLessIcon sx={{ fontSize: 14 }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 14 }} />
          )}
          <Text size="xs" c="dimmed">
            {label}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={expanded}>
        <List
          type="ordered"
          size="xs"
          mt={4}
          pl="lg"
          styles={{ itemWrapper: { lineHeight: 1.4 } }}
        >
          {names.map((name, i) => (
            <List.Item key={i}>{name}</List.Item>
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

function ChatMessageBubble({
  role,
  content,
  timestamp,
  toolsUsed,
  resolveToolName,
  t,
}: {
  role: ChatRole;
  content: string;
  timestamp: number;
  toolsUsed?: string[];
  resolveToolName: ToolNameResolver;
  t: TranslateFn;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const actions = (
    <div className="chat-message-actions">
      <button
        type="button"
        className={`chat-message-action-btn${copied ? " chat-message-action-btn--active" : ""}`}
        onClick={handleCopy}
        title={t("chat.actions.copy", "Copy message")}
      >
        <ContentCopyIcon sx={{ fontSize: 13 }} />
      </button>
      <span className="chat-message-timestamp">
        {formatRelativeTime(timestamp)}
      </span>
    </div>
  );

  if (role === ChatRole.USER) {
    return (
      <div className="chat-message chat-message-user">
        <div className="chat-message-user__inner">
          <Paper className="chat-bubble chat-bubble-user" p="xs" radius="md">
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {content}
            </Text>
          </Paper>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-message chat-message-assistant">
      <div className="chat-bubble-assistant">
        <Text size="sm" component="div">
          {renderMarkdown(content)}
        </Text>
        {toolsUsed && toolsUsed.length > 0 && (
          <ToolsUsedBlock
            tools={toolsUsed}
            resolveToolName={resolveToolName}
            t={t}
          />
        )}
        {actions}
      </div>
    </div>
  );
}

export interface ChatPanelProps {
  /** Called when the user closes the chat to return to the tool list. */
  onBack: () => void;
  /** Accessible label for the close button. */
  backLabel: string;
}

export function ChatPanel({ onBack, backLabel }: ChatPanelProps) {
  const { t } = useTranslation();
  const { messages, isLoading, progress, sendMessage, clearChat } = useChat();
  const resolveToolName = useToolNameResolver();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showQuickActions = messages.length === 0 && !isLoading;

  return (
    <Box className="chat-panel chat-panel--embedded">
      <div className="chat-panel__header">
        <Menu shadow="md" width={220} position="bottom-start" withinPortal>
          <Menu.Target>
            <button
              type="button"
              className={`chat-panel__agent-pill${isLoading ? " chat-panel__agent-pill--loading" : ""}`}
              aria-label={t("chat.header.agentMenu", "Stirling agent options")}
            >
              <span className="chat-panel__agent-pill-icon">
                <StirlingLogoOutline size={16} />
                {isLoading && <span className="agent-status-dot" />}
              </span>
              <span className="chat-panel__agent-pill-label">
                {t("agents.stirling_name", "Stirling")}
              </span>
              <KeyboardArrowDownIcon
                sx={{ fontSize: 18, color: "var(--text-muted)" }}
              />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<DeleteSweepIcon sx={{ fontSize: 18 }} />}
              onClick={clearChat}
              disabled={messages.length === 0 && !isLoading}
            >
              {t("chat.header.clearChat", "Clear chat")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="xl"
          onClick={onBack}
          aria-label={backLabel}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </ActionIcon>
      </div>

      <ScrollArea className="chat-panel-messages" viewportRef={scrollRef}>
        <Stack gap="sm" px="md" py="sm">
          {messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              toolsUsed={msg.toolsUsed}
              resolveToolName={resolveToolName}
              t={t}
            />
          ))}
          {isLoading && (
            <div className="chat-message chat-message-assistant">
              <div className="chat-thinking">
                <StirlingLogoAnimated size={20} />
                <Text size="sm" c="dimmed">
                  {progress
                    ? formatProgress(progress, t, resolveToolName)
                    : t("chat.progress.thinking")}
                </Text>
              </div>
            </div>
          )}
        </Stack>
      </ScrollArea>

      {showQuickActions && (
        <ChatQuickActions
          heading={t("chat.quickActions.heading", "Get started")}
          onAction={(text) => handleSend(text)}
        />
      )}

      <div className="chat-panel-input">
        <Textarea
          ref={inputRef}
          placeholder={t("chat.input.placeholder", "What do you want to do?")}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autosize
          minRows={1}
          maxRows={4}
          variant="unstyled"
          classNames={{ input: "chat-panel-input__field" }}
        />
        <div className="chat-panel-input__actions">
          <ActionIcon
            variant="filled"
            color="blue"
            radius="xl"
            size="md"
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            aria-label={t("chat.input.send", "Send message")}
          >
            <ArrowUpwardIcon sx={{ fontSize: 16 }} />
          </ActionIcon>
        </div>
      </div>
    </Box>
  );
}
