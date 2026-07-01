import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Chip, ToggleSwitch } from "@shared/components";
import { type Agent, type ToolMode, TOOL_CATALOGUE } from "@portal/api/agents";
import "@portal/views/AgentBuilder.css";

interface ToolsPanelProps {
  agent: Agent;
  /** Restricted-tools governance is an enterprise capability. */
  governanceUnlocked: boolean;
}

/**
 * Tool-access posture. `broad` grants every tool; `restricted` is allow-by-
 * default minus an explicit deny list, picked from the known tool catalogue.
 */
export function ToolsPanel({ agent, governanceUnlocked }: ToolsPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ToolMode>(agent.toolMode);
  const [denied, setDenied] = useState<string[]>(agent.deniedTools);

  function setRestricted(on: boolean) {
    // TODO(backend): PATCH /v1/agents/{id}/tools { mode, deniedTools } —
    // persist the access posture.
    setMode(on ? "restricted" : "broad");
  }

  function toggleDenied(tool: string) {
    setDenied((cur) =>
      cur.includes(tool) ? cur.filter((t) => t !== tool) : [...cur, tool],
    );
  }

  const restricted = mode === "restricted";

  return (
    <div className="portal-agents__panel">
      <div className="portal-agents__tool-mode">
        <ToggleSwitch
          checked={restricted}
          onChange={setRestricted}
          disabled={!governanceUnlocked}
          label={t("agentBuilder.tools.restrictedAccess")}
          description={
            governanceUnlocked
              ? t("agentBuilder.tools.restrictedDescription")
              : t("agentBuilder.tools.governanceGate")
          }
        />
        <Chip tone={restricted ? "amber" : "green"} size="sm">
          {restricted
            ? t("agentBuilder.tools.restricted")
            : t("agentBuilder.tools.broadAccess")}
        </Chip>
      </div>

      {restricted && (
        <div className="portal-agents__detail-section">
          <span className="portal-agents__detail-heading">
            {t("agentBuilder.tools.deniedTools")}
          </span>
          <p className="portal-agents__hint">
            {t("agentBuilder.tools.deniedHint")}
          </p>
          <div className="portal-agents__chips">
            {TOOL_CATALOGUE.map((tool) => {
              const isDenied = denied.includes(tool);
              return (
                <Chip
                  key={tool}
                  tone={isDenied ? "red" : "neutral"}
                  size="sm"
                  onClick={
                    governanceUnlocked ? () => toggleDenied(tool) : undefined
                  }
                >
                  {isDenied ? "✕ " : ""}
                  {tool}
                </Chip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
