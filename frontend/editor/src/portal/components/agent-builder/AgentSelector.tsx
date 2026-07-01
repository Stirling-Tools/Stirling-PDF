import { useTranslation } from "react-i18next";
import { type Agent, AGENT_STATUS_TONE } from "@portal/api/agents";
import { StatusBadge } from "@shared/components";
import "@portal/views/AgentBuilder.css";

interface AgentSelectorProps {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Left-rail list of agents; the selected row drives which builder is shown. */
export function AgentSelector({
  agents,
  selectedId,
  onSelect,
}: AgentSelectorProps) {
  const { t } = useTranslation();
  return (
    <nav
      className="portal-agents__selector"
      aria-label={t("agentBuilder.selectorAriaLabel")}
    >
      {agents.map((a) => (
        <button
          key={a.id}
          type="button"
          className={
            "portal-agents__selector-item" +
            (a.id === selectedId ? " is-selected" : "")
          }
          aria-current={a.id === selectedId}
          onClick={() => onSelect(a.id)}
        >
          <span className="portal-agents__selector-main">
            <strong className="portal-agents__selector-name">{a.name}</strong>
            <span className="portal-agents__selector-role">{a.role}</span>
          </span>
          <span className="portal-agents__selector-meta">
            <StatusBadge tone={AGENT_STATUS_TONE[a.status]} size="sm">
              {a.status}
            </StatusBadge>
            <code className="portal-agents__selector-version">{a.version}</code>
          </span>
        </button>
      ))}
    </nav>
  );
}
