import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge, Tabs, type TabItem } from "@shared/components";
import { type Agent, AGENT_STATUS_TONE } from "@portal/api/agents";
import { ScenariosPanel } from "@portal/components/agent-builder/ScenariosPanel";
import { ToolsPanel } from "@portal/components/agent-builder/ToolsPanel";
import { EvalsPanel } from "@portal/components/agent-builder/EvalsPanel";
import { VersionsPanel } from "@portal/components/agent-builder/VersionsPanel";
import "@portal/views/AgentBuilder.css";

type BuilderTab = "scenarios" | "tools" | "evals" | "versions";

interface AgentBuilderPanelProps {
  agent: Agent;
  /** Enterprise unlocks restricted-tools governance and deep version history. */
  governanceUnlocked: boolean;
}

/** The selected agent's builder: header + tabbed Scenarios / Tools / Evals / Versions. */
export function AgentBuilderPanel({
  agent,
  governanceUnlocked,
}: AgentBuilderPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<BuilderTab>("scenarios");

  const tabs: TabItem<BuilderTab>[] = [
    {
      key: "scenarios",
      label: t("agentBuilder.tabs.scenarios"),
      count: agent.scenarios.length,
    },
    { key: "tools", label: t("agentBuilder.tabs.tools") },
    {
      key: "evals",
      label: t("agentBuilder.tabs.evals"),
      count: agent.evalsTotal > 0 ? agent.evalsTotal : undefined,
    },
    {
      key: "versions",
      label: t("agentBuilder.tabs.versions"),
      count: agent.versions.length,
    },
  ];

  return (
    <section className="portal-agents__builder">
      <header className="portal-agents__builder-head">
        <div>
          <h2 className="portal-agents__builder-title">{agent.name}</h2>
          <span className="portal-agents__builder-sub">{agent.role}</span>
        </div>
        <div className="portal-agents__builder-meta">
          <StatusBadge tone={AGENT_STATUS_TONE[agent.status]} size="sm">
            {agent.status}
          </StatusBadge>
          <code className="portal-agents__builder-version">
            {agent.version}
          </code>
          <code className="portal-agents__builder-model">{agent.model}</code>
        </div>
      </header>

      <Tabs<BuilderTab>
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel={t("agentBuilder.sectionsAriaLabel")}
      />

      {tab === "scenarios" && <ScenariosPanel agent={agent} />}
      {tab === "tools" && (
        <ToolsPanel agent={agent} governanceUnlocked={governanceUnlocked} />
      )}
      {tab === "evals" && <EvalsPanel agent={agent} />}
      {tab === "versions" && (
        <VersionsPanel agent={agent} historyUnlocked={governanceUnlocked} />
      )}
    </section>
  );
}
