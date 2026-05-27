import { useState } from "react";
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
import "@app/components/agents/AgentsPanel.css";

interface ComingSoonAgent {
  id: string;
  name: string;
  description: string;
  Icon: ElementType;
}

const COMING_SOON_AGENTS: ComingSoonAgent[] = [
  {
    id: "data-extraction",
    name: "Data Extraction",
    description: "Extract tables & structured data",
    Icon: TableChartRoundedIcon,
  },
  {
    id: "doc-summary",
    name: "Summariser",
    description: "Summarise long documents",
    Icon: SummarizeRoundedIcon,
  },
  {
    id: "auto-redaction",
    name: "Auto Redaction",
    description: "Redact PII automatically",
    Icon: VisibilityOffRoundedIcon,
  },
  {
    id: "compliance",
    name: "Compliance Check",
    description: "Audit documents for compliance",
    Icon: GavelRoundedIcon,
  },
  {
    id: "form-filler",
    name: "Form Filler",
    description: "Fill PDF forms intelligently",
    Icon: AssignmentRoundedIcon,
  },
  {
    id: "pdf-to-markdown",
    name: "PDF to Markdown",
    description: "Convert PDFs to clean Markdown",
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
        {visibleAgents.map(({ id, name, description, Icon }) => (
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
                    {name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {description}
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
          {COMING_SOON_AGENTS.map(({ id, name, description, Icon }) => (
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
                    {name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {description}
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

/** Full-rail chat overlay rendered inside ToolPanel. */
export function AgentsChatOverlay() {
  const { t } = useTranslation();
  const { isOpen, setOpen } = useChat();
  const enabled = useAgentsEnabled();

  if (!enabled || !isOpen) return null;

  return (
    <Box className="agents-takeover">
      <ChatPanel
        onBack={() => withViewTransition(() => setOpen(false))}
        backLabel={t("agents.back_to_tools", "Back to tools")}
      />
    </Box>
  );
}
