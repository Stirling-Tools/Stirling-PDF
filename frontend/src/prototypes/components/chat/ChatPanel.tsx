import {
  useMemo,
  useRef,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  ScrollArea,
  TextInput,
  Stack,
  Text,
  Paper,
  Box,
  Transition,
  Loader,
  Group,
  Collapse,
  UnstyledButton,
  List,
} from "@mantine/core";
import SendIcon from "@mui/icons-material/Send";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import {
  useChat,
  AiWorkflowPhase,
  type AiWorkflowProgress,
} from "@app/components/chat/ChatContext";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import "@app/components/chat/ChatPanel.css";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

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
      // Only register tools with a static endpoint. Tools whose endpoint is a function
      // (dynamic routing, e.g. Convert / Split) need runtime params to resolve, so they fall
      // through to the generic progress message rather than mis-matching.
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
    // Unknown tool — fall back to a generic translated message rather than
    // prettifying the endpoint path by hand.
    return hasSteps
      ? t("chat.progress.executing_tool_generic_step", {
          step: progress.stepIndex,
          total: progress.stepCount,
        })
      : t("chat.progress.executing_tool_generic");
  }
  return t(`chat.progress.${progress.phase}`);
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
  toolsUsed,
  resolveToolName,
  t,
}: {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  resolveToolName: ToolNameResolver;
  t: TranslateFn;
}) {
  return (
    <div className={`chat-message chat-message-${role}`}>
      <Paper className={`chat-bubble chat-bubble-${role}`} p="xs" radius="md">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {content}
        </Text>
        {toolsUsed && toolsUsed.length > 0 && (
          <ToolsUsedBlock
            tools={toolsUsed}
            resolveToolName={resolveToolName}
            t={t}
          />
        )}
      </Paper>
    </div>
  );
}

export function ChatPanel() {
  const { t } = useTranslation();
  const { messages, isOpen, isLoading, progress, toggleOpen, sendMessage } =
    useChat();
  const resolveToolName = useToolNameResolver();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle button - always visible */}
      {!isOpen && (
        <ActionIcon
          className="chat-toggle-button"
          variant="filled"
          color="blue"
          size="xl"
          radius="xl"
          onClick={toggleOpen}
          aria-label="Open chat"
        >
          <ChatBubbleOutlineIcon sx={{ fontSize: 24 }} />
        </ActionIcon>
      )}

      {/* Chat panel */}
      <Transition mounted={isOpen} transition="slide-left" duration={200}>
        {(styles) => (
          <Box className="chat-panel" style={styles}>
            {/* Header */}
            <div className="chat-panel-header">
              <Text fw={600} size="sm">
                AI Assistant
              </Text>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={toggleOpen}
                aria-label="Close chat"
              >
                <CloseIcon sx={{ fontSize: 16 }} />
              </ActionIcon>
            </div>

            {/* Messages */}
            <ScrollArea className="chat-panel-messages" viewportRef={scrollRef}>
              <Stack gap="sm" p="sm">
                {messages.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Ask a question about your documents or get help with PDF
                    tools.
                  </Text>
                )}
                {messages.map((msg) => (
                  <ChatMessageBubble
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    toolsUsed={msg.toolsUsed}
                    resolveToolName={resolveToolName}
                    t={t}
                  />
                ))}
                {isLoading && (
                  <div className="chat-message chat-message-assistant">
                    <Paper
                      className="chat-bubble chat-bubble-assistant"
                      p="xs"
                      radius="md"
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Loader size="xs" type="dots" />
                        <Text size="sm" c="dimmed">
                          {progress
                            ? formatProgress(progress, t, resolveToolName)
                            : t("chat.progress.thinking")}
                        </Text>
                      </Group>
                    </Paper>
                  </div>
                )}
              </Stack>
            </ScrollArea>

            {/* Input */}
            <div className="chat-panel-input">
              <TextInput
                ref={inputRef}
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rightSection={
                  <ActionIcon
                    variant="filled"
                    color="blue"
                    size="sm"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    aria-label="Send message"
                  >
                    <SendIcon sx={{ fontSize: 14 }} />
                  </ActionIcon>
                }
                rightSectionWidth={36}
                style={{ flex: 1 }}
              />
            </div>
          </Box>
        )}
      </Transition>
    </>
  );
}
