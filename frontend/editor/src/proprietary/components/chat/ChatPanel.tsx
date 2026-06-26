import {
  useMemo,
  useRef,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { renderMarkdown } from "@app/components/viewer/nonpdf/MarkdownRenderer";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Box,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from "@mantine/core";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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
import { StirlingLogoAnimated } from "@app/components/agents/StirlingLogoAnimated";
import { StirlingLogoOutline } from "@app/components/agents/StirlingLogoOutline";
import { PanelHeader } from "@shared/components/PanelHeader";
import { ChatQuickActions } from "@app/components/chat/ChatQuickActions";
import "@app/components/chat/ChatPanel.css";

type TranslateFn = TFunction;

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

/** Resolver mapping a tool endpoint path to its registry icon ReactNode. */
type ToolIconResolver = (endpoint: string) => ReactNode | null;

/**
 * Look up a tool's icon ReactNode from the tool catalog, keyed by API endpoint path.
 * Returns null when the endpoint is not found (use a generic fallback icon in that case).
 */
function useToolIconResolver(): ToolIconResolver {
  const { allTools } = useTranslatedToolCatalog();
  return useMemo(() => {
    const iconByEndpoint = new Map<string, ReactNode>();
    Object.values(allTools).forEach((tool) => {
      const endpoint = tool.operationConfig?.endpoint;
      if (typeof endpoint === "string") {
        iconByEndpoint.set(endpoint, tool.icon);
      }
    });
    return (endpoint: string) => iconByEndpoint.get(endpoint) ?? null;
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

/**
 * Phase-specific icon for a progress step: the tool's registry icon while a
 * tool runs, or a generic glyph for the read/extract/think phases. Used for the
 * right-hand "what it's doing" icon in the live indicator and for each row of
 * the completed tool breakdown.
 */
function progressStepIcon(
  progress: AiWorkflowProgress,
  resolveToolIcon: ToolIconResolver,
): ReactNode {
  if (progress.phase === AiWorkflowPhase.EXECUTING_TOOL) {
    const registryIcon = progress.tool ? resolveToolIcon(progress.tool) : null;
    if (registryIcon) {
      return <span className="chat-step-icon-scaled">{registryIcon}</span>;
    }
    return <BuildOutlinedIcon sx={{ fontSize: 17 }} />;
  }
  if (
    progress.phase === AiWorkflowPhase.EXTRACTING_CONTENT ||
    progress.phase === AiWorkflowPhase.ENGINE_PROGRESS
  ) {
    return <ArticleOutlinedIcon sx={{ fontSize: 17 }} />;
  }
  return <CloudOutlinedIcon sx={{ fontSize: 17 }} />;
}

/**
 * Live progress indicator shown while the AI is working. One step at a time:
 * our animated logo on the left, the current step's label shimmering in the
 * middle, and the phase-specific icon (what it's doing right now) on the right.
 * The latest event replaces the previous one in place — no growing list.
 */
function ProgressLogDisplay({
  progressLog,
  t,
  resolveToolName,
  resolveToolIcon,
}: {
  progressLog: AiWorkflowProgress[];
  t: TranslateFn;
  resolveToolName: ToolNameResolver;
  resolveToolIcon: ToolIconResolver;
}) {
  const current =
    progressLog.length > 0 ? progressLog[progressLog.length - 1] : null;
  const label = current
    ? formatProgress(current, t, resolveToolName)
    : t("chat.progress.thinking");

  return (
    <div className="chat-progress-live">
      <span className="chat-progress-live__logo">
        <StirlingLogoAnimated size={18} />
      </span>
      <span className="chat-progress-live__label">{label}</span>
      {current && (
        <span className="chat-progress-live__phase-icon">
          {progressStepIcon(current, resolveToolIcon)}
        </span>
      )}
    </div>
  );
}

function formatDuration(ms: number, t: TranslateFn): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return t("chat.progress.ranForSeconds", { count: totalSeconds });
  }
  if (seconds === 0) {
    return t("chat.progress.ranForMinutes", { count: minutes });
  }
  return t("chat.progress.ranForMinutesSeconds", { minutes, seconds });
}

/**
 * Collapsed "Ran for X seconds" control above each completed assistant turn.
 * Expands to a numbered list of just the tools that actually ran — generic
 * progress phases (analysing, thinking, reading the document, …) are omitted.
 * When no tool ran, the duration shows as a plain label with nothing to expand.
 */
function CompletedProgressLogDropdown({
  progressLog,
  durationMs,
  t,
  resolveToolName,
  resolveToolIcon,
}: {
  progressLog: AiWorkflowProgress[];
  durationMs: number;
  t: TranslateFn;
  resolveToolName: ToolNameResolver;
  resolveToolIcon: ToolIconResolver;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = formatDuration(durationMs, t);

  const toolSteps = progressLog.filter(
    (step) => step.phase === AiWorkflowPhase.EXECUTING_TOOL && step.tool,
  );

  // A purely conversational turn (no tools): just show the duration, nothing
  // to expand.
  if (toolSteps.length === 0) {
    return (
      <div className="chat-completed-log">
        <Text size="xs" c="dimmed" className="chat-completed-log__static">
          {label}
        </Text>
      </div>
    );
  }

  return (
    <div className="chat-completed-log">
      <UnstyledButton
        className="chat-completed-log__toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Group gap={4} wrap="nowrap" align="center">
          {expanded ? (
            <ExpandLessIcon sx={{ fontSize: 12 }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 12 }} />
          )}
          <Text size="xs" c="dimmed">
            {label}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={expanded}>
        <ol className="chat-completed-log__tools">
          {toolSteps.map((step, i) => {
            const endpoint = step.tool ?? "";
            const name = resolveToolName(endpoint) ?? endpoint;
            return (
              <li key={i} className="chat-completed-log__tool">
                <span className="chat-completed-log__tool-num">{i + 1}</span>
                <span className="chat-completed-log__tool-icon">
                  {progressStepIcon(step, resolveToolIcon)}
                </span>
                <span className="chat-completed-log__tool-name">{name}</span>
              </li>
            );
          })}
        </ol>
      </Collapse>
    </div>
  );
}

function ChatMessageBubble({
  role,
  content,
  timestamp,
  progressLog,
  durationMs,
  resolveToolName,
  resolveToolIcon,
  t,
}: {
  role: ChatRole;
  content: string;
  timestamp: number;
  progressLog?: AiWorkflowProgress[];
  durationMs?: number;
  resolveToolName: ToolNameResolver;
  resolveToolIcon: ToolIconResolver;
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
        {formatRelativeTime(timestamp, t)}
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
        {progressLog && progressLog.length > 0 && durationMs != null && (
          <CompletedProgressLogDropdown
            progressLog={progressLog}
            durationMs={durationMs}
            t={t}
            resolveToolName={resolveToolName}
            resolveToolIcon={resolveToolIcon}
          />
        )}
        <Text size="sm" component="div">
          {renderMarkdown(content)}
        </Text>
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
  const { messages, isLoading, progressLog, sendMessage, clearChat } =
    useChat();
  const resolveToolName = useToolNameResolver();
  const resolveToolIcon = useToolIconResolver();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Tracks whether the user manually scrolled away from the bottom.
  // A ref (not state) so scroll events don't cause re-renders.
  const userScrolledUp = useRef(false);

  // Jump to the bottom on first render so existing conversations open at the
  // most recent message rather than the top.
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Attach a passive scroll listener to track whether the user has scrolled
  // away from the bottom (breaks auto-scroll) or returned to it (re-latches).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledUp.current = distFromBottom > 50;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll to the bottom when messages arrive or live progress steps update,
  // unless the user has scrolled up (they're reading history).
  // Scrolling back to the bottom resets the ref, so the next update re-latches.
  //
  // RAF defers the scroll until after the browser has laid out the new nodes,
  // so scrollHeight is correct. Direct scrollTop assignment avoids the
  // smooth-scroll interruption problem that occurs when SSE events arrive
  // faster than a smooth animation can complete.
  useEffect(() => {
    if (!userScrolledUp.current) {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, progressLog]);

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
  const disclaimerText = t(
    "chat.input.disclaimer",
    "AI can make mistakes. Be sure to verify the output before sharing.",
  );

  return (
    <Box className="chat-panel chat-panel--embedded">
      <PanelHeader
        icon={<StirlingLogoOutline size={16} />}
        title={t("agents.stirling_name", "Stirling")}
        loading={isLoading}
        className="chat-panel__header"
        barClassName="chat-panel__agent-pill-vt"
        menuLabel={t("chat.header.agentMenu", "Stirling agent options")}
        menuItems={[
          {
            key: "clear-chat",
            icon: <DeleteSweepIcon sx={{ fontSize: 18 }} />,
            label: t("chat.header.clearChat", "Clear chat"),
            onClick: clearChat,
            disabled: messages.length === 0 && !isLoading,
          },
        ]}
        onClose={onBack}
        closeLabel={backLabel}
      />

      {showQuickActions && (
        <div className="chat-panel-disclaimer chat-panel-disclaimer--banner">
          <InfoOutlinedIcon
            className="chat-panel-disclaimer__icon"
            sx={{ fontSize: 18 }}
          />
          <span>{disclaimerText}</span>
        </div>
      )}

      <ScrollArea className="chat-panel-messages" viewportRef={scrollRef}>
        <Stack
          gap="sm"
          px="md"
          pt="sm"
          className="chat-panel-messages__content"
        >
          {messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              progressLog={msg.progressLog}
              durationMs={msg.durationMs}
              resolveToolName={resolveToolName}
              resolveToolIcon={resolveToolIcon}
              t={t}
            />
          ))}
          {isLoading && (
            <div className="chat-message chat-message-assistant">
              <ProgressLogDisplay
                progressLog={progressLog}
                t={t}
                resolveToolName={resolveToolName}
                resolveToolIcon={resolveToolIcon}
              />
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

      {!showQuickActions && (
        <div className="chat-panel-disclaimer chat-panel-disclaimer--inline">
          <InfoOutlinedIcon
            className="chat-panel-disclaimer__icon"
            sx={{ fontSize: 13 }}
          />
          <span>{disclaimerText}</span>
        </div>
      )}

      <div className="chat-panel-input">
        <ActionIcon
          className="chat-panel-input__send"
          variant="filled"
          color="blue"
          radius="xl"
          size="sm"
          onClick={() => handleSend()}
          disabled={!input.trim() || isLoading}
          aria-label={t("chat.input.send", "Send message")}
        >
          <ArrowUpwardIcon sx={{ fontSize: 16 }} />
        </ActionIcon>
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
          classNames={{
            root: "chat-panel-input__textarea",
            input: "chat-panel-input__field",
          }}
        />
      </div>
    </Box>
  );
}
