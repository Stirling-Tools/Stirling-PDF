import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ElementType } from "react";
import { Box, Group, Text, UnstyledButton } from "@mantine/core";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import SummarizeRoundedIcon from "@mui/icons-material/SummarizeRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useChat } from "@app/components/chat/ChatContext";
import { ChatPanel } from "@app/components/chat/ChatPanel";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { StirlingLogoOutline } from "@app/components/agents/StirlingLogoOutline";
import { withViewTransition } from "@app/utils/viewTransition";
import { Z_INDEX_AGENTS_CHAT_OVERLAY } from "@app/styles/zIndex";
import "@app/components/agents/AgentsPanel.css";

interface ComingSoonAgent {
  id: string;
  nameKey: string;
  descriptionKey: string;
  Icon: ElementType;
}

const COMING_SOON_AGENTS: ComingSoonAgent[] = [
  {
    id: "data-extraction",
    nameKey: "agents.data_extraction_name",
    descriptionKey: "agents.data_extraction_description",
    Icon: TableChartRoundedIcon,
  },
  {
    id: "doc-summary",
    nameKey: "agents.doc_summary_name",
    descriptionKey: "agents.doc_summary_description",
    Icon: SummarizeRoundedIcon,
  },
  {
    id: "auto-redaction",
    nameKey: "agents.auto_redaction_name",
    descriptionKey: "agents.auto_redaction_description",
    Icon: VisibilityOffRoundedIcon,
  },
  {
    id: "compliance",
    nameKey: "agents.compliance_name",
    descriptionKey: "agents.compliance_description",
    Icon: GavelRoundedIcon,
  },
  {
    id: "form-filler",
    nameKey: "agents.form_filler_name",
    descriptionKey: "agents.form_filler_description",
    Icon: AssignmentRoundedIcon,
  },
  {
    id: "pdf-to-markdown",
    nameKey: "agents.pdf_to_markdown_name",
    descriptionKey: "agents.pdf_to_markdown_description",
    Icon: CodeRoundedIcon,
  },
];

export function useAgentsEnabled(): boolean {
  const { config } = useAppConfig();
  return Boolean(config?.aiEngineEnabled);
}

export function useAgentChatOpen(): boolean {
  const { isOpen } = useChat();
  return isOpen;
}

const PREVIEW_COUNT = 3;

/** Sidebar agents section — Stirling as hero CTA, coming-soon agents below. */
export function AgentsSection() {
  const { t } = useTranslation();
  const { isOpen, setOpen } = useChat();
  const enabled = useAgentsEnabled();
  const [showAll, setShowAll] = useState(false);

  if (!enabled || isOpen) return null;

  const comingSoonLabel = t("agents.coming_soon", "Coming soon");
  const visibleAgents = showAll
    ? COMING_SOON_AGENTS
    : COMING_SOON_AGENTS.slice(0, PREVIEW_COUNT);

  return (
    <Box className="agents-section" w="100%">
      {/* Main Stirling agent — real and clickable */}
      <UnstyledButton
        className="agent-button agent-button--hero"
        onClick={() => withViewTransition(() => setOpen(true))}
        aria-label={t("agents.stirling_name", "Stirling")}
      >
        <Group gap="sm" wrap="nowrap" align="center">
          <Box className="agent-button__logo">
            <StirlingLogoOutline size={28} />
          </Box>
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={600} truncate>
              {t("agents.stirling_name", "Stirling")}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {t(
                "agents.stirling_description",
                "Your general-purpose PDF assistant",
              )}
            </Text>
          </Box>
        </Group>
      </UnstyledButton>

      {/* Coming-soon agents */}
      <div className="agents-sidebar-list">
        {visibleAgents.map(({ id, nameKey, descriptionKey, Icon }) => (
          <AppTooltip
            key={id}
            content={comingSoonLabel}
            position="left"
            arrow
            delay={0}
          >
            <UnstyledButton
              className="agent-button agent-button--coming-soon"
              aria-disabled="true"
              tabIndex={-1}
            >
              <Group gap="sm" wrap="nowrap" align="center">
                <Box className="agent-button__icon-plain">
                  <Icon sx={{ fontSize: "1.1rem" }} />
                </Box>
                <Box style={{ minWidth: 0, flex: 1 }}>
                  <Text size="sm" fw={500} truncate>
                    {t(nameKey)}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {t(descriptionKey)}
                  </Text>
                </Box>
              </Group>
            </UnstyledButton>
          </AppTooltip>
        ))}
      </div>

      {!showAll ? (
        <button
          type="button"
          className="agents-view-all"
          onClick={() => withViewTransition(() => setShowAll(true))}
        >
          {t("agents.view_all", "View all agents")} →
        </button>
      ) : (
        <button
          type="button"
          className="agents-view-all"
          onClick={() => withViewTransition(() => setShowAll(false))}
        >
          {t("agents.show_less", "Show less")} ↑
        </button>
      )}
    </Box>
  );
}

/** Icon-only agent button in the collapsed (minimised) right rail. */
export function AgentsCollapsedButton({ onExpand }: { onExpand: () => void }) {
  const { t } = useTranslation();
  const { setOpen } = useChat();
  const enabled = useAgentsEnabled();

  if (!enabled) return null;

  const label = t("agents.stirling_tooltip", "Stirling agent");

  return (
    <AppTooltip content={label} position="left" arrow delay={300}>
      <UnstyledButton
        onClick={() => {
          onExpand();
          setOpen(true);
        }}
        aria-label={label}
        className="agents-collapsed-btn"
      >
        <StirlingLogoOutline size={22} />
      </UnstyledButton>
    </AppTooltip>
  );
}

/**
 * Fullscreen hero card — Stirling CTA on the left, 2×3 coming-soon grid on
 * the right. Matches the gradient border of the other fullscreen category cards.
 */
export function AgentsFullscreenSection() {
  const { t } = useTranslation();
  const { isOpen, setOpen } = useChat();
  const enabled = useAgentsEnabled();

  if (!enabled || isOpen) return null;

  const comingSoonLabel = t("agents.coming_soon", "Coming soon");

  return (
    <section
      className="agents-hero tool-panel__fullscreen-group--agents"
      aria-label={t("agents.section_title", "Agents")}
    >
      <div className="agents-hero__body">
        {/* Left: Stirling content — only the button is interactive */}
        <div className="agents-hero__cta">
          <div className="agents-hero__cta-logo">
            <StirlingLogoOutline size={36} />
          </div>
          <Text className="agents-hero__cta-headline" fw={700} lh={1.2} mt="xs">
            {t("agents.stirling_full_name", "Stirling General Agent")}
          </Text>
          <Text size="sm" c="dimmed" mt={8} lh={1.55}>
            {t(
              "agents.stirling_long_description",
              "General purpose PDF assistant that can run tools, create PDFs and extract insights from your documents.",
            )}
          </Text>
          <button
            type="button"
            className="agents-hero__cta-btn"
            onClick={() => withViewTransition(() => setOpen(true))}
          >
            {t("agents.start_chat", "Start chatting")} →
          </button>
        </div>

        {/* Right: 2×3 grid of coming-soon agents */}
        <div className="agents-hero__grid">
          {COMING_SOON_AGENTS.map(({ id, nameKey, descriptionKey, Icon }) => (
            <AppTooltip
              key={id}
              content={comingSoonLabel}
              position="top"
              arrow
              delay={0}
            >
              <button
                type="button"
                className="agents-hero__grid-item"
                aria-disabled="true"
              >
                <span className="agents-hero__grid-icon">
                  <Icon sx={{ fontSize: "1rem" }} />
                </span>
                <div className="agents-hero__grid-body">
                  <Text size="sm" fw={500} truncate>
                    {t(nameKey)}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {t(descriptionKey)}
                  </Text>
                </div>
              </button>
            </AppTooltip>
          ))}
        </div>
      </div>
    </section>
  );
}

const DEFAULT_CHAT_WIDTH = 18.5 * 16; // 18.5rem in px
const MIN_CHAT_WIDTH = 240;
const MAX_CHAT_WIDTH = 720;

/** Full-rail chat overlay rendered inside ToolPanel. */
export function AgentsChatOverlay() {
  const { t } = useTranslation();
  const { isOpen, setOpen } = useChat();
  const enabled = useAgentsEnabled();
  const [widthPx, setWidthPx] = useState(DEFAULT_CHAT_WIDTH);
  const [isClosing, setIsClosing] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setWidthPx(DEFAULT_CHAT_WIDTH);
    setTimeout(() => {
      setIsClosing(false);
      withViewTransition(() => setOpen(false));
    }, 280);
  }, [setOpen]);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragState.current = { startX: e.clientX, startWidth: widthPx };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startX - ev.clientX;
        setWidthPx(
          Math.max(
            MIN_CHAT_WIDTH,
            Math.min(MAX_CHAT_WIDTH, dragState.current.startWidth + delta),
          ),
        );
      };

      const cleanup = () => {
        dragState.current = null;
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    },
    [widthPx],
  );

  if (!enabled || (!isOpen && !isClosing)) return null;

  return createPortal(
    <Box
      className="agents-takeover"
      style={{
        zIndex: Z_INDEX_AGENTS_CHAT_OVERLAY,
        width: widthPx,
        transition: isClosing
          ? "width 280ms cubic-bezier(0.32, 0.72, 0, 1)"
          : "none",
      }}
    >
      <div
        className="agents-takeover__resize-handle"
        onPointerDown={handleResizePointerDown}
        role="separator"
        aria-label={t("chat.resize", "Resize chat panel")}
        aria-orientation="vertical"
      />
      <ChatPanel
        onBack={handleClose}
        backLabel={t("agents.back_to_tools", "Back to tools")}
      />
    </Box>,
    document.body,
  );
}
