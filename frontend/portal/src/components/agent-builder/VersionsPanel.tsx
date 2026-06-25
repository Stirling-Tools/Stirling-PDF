import { useTranslation } from "react-i18next";
import { Button, StatusBadge } from "@shared/components";
import { type Agent, AGENT_STATUS_TONE } from "@portal/api/agents";
import "@portal/views/AgentBuilder.css";

interface VersionsPanelProps {
  agent: Agent;
  /** Deep version history is an enterprise capability; lower tiers see the gate. */
  historyUnlocked: boolean;
}

/** Render an ISO timestamp as a short, locale-stable date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Version history with publish / rollback actions per row. */
export function VersionsPanel({ agent, historyUnlocked }: VersionsPanelProps) {
  const { t } = useTranslation();
  // Without governance, only the current version is meaningful to show.
  const versions = historyUnlocked
    ? agent.versions
    : agent.versions.slice(0, 1);
  const publishedExists = agent.versions.some((v) => v.status === "published");

  function publish(version: string) {
    void version;
    // TODO(backend): POST /v1/agents/{id}/versions/{v}/publish — promote the
    // draft to published and demote the previous published version.
  }

  function rollback(version: string) {
    void version;
    // TODO(backend): POST /v1/agents/{id}/versions/{v}/rollback — re-publish a
    // prior version as the active one.
  }

  return (
    <div className="portal-agents__panel">
      <ol className="portal-agents__versions">
        {versions.map((v) => {
          const isCurrent = v.version === agent.version;
          return (
            <li key={v.version} className="portal-agents__version">
              <div className="portal-agents__version-main">
                <div className="portal-agents__version-head">
                  <code className="portal-agents__version-tag">
                    {v.version}
                  </code>
                  <StatusBadge tone={AGENT_STATUS_TONE[v.status]} size="sm">
                    {v.status}
                  </StatusBadge>
                  {isCurrent && (
                    <StatusBadge tone="info" size="sm" showDot={false}>
                      {t("agentBuilder.versions.current")}
                    </StatusBadge>
                  )}
                </div>
                <span className="portal-agents__version-note">{v.note}</span>
                <span className="portal-agents__version-meta">
                  {formatDate(v.createdAt)} · {v.author}
                </span>
              </div>
              <div className="portal-agents__version-actions">
                {v.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => publish(v.version)}
                  >
                    {t("agentBuilder.versions.publish")}
                  </Button>
                )}
                {v.status === "published" && !isCurrent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => rollback(v.version)}
                  >
                    {t("agentBuilder.versions.rollBack")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!historyUnlocked && publishedExists && (
        <p className="portal-agents__hint">
          {t("agentBuilder.versions.historyGate")}
        </p>
      )}
    </div>
  );
}
