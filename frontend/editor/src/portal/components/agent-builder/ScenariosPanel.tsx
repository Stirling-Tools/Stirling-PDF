import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Chip,
  FormField,
  Input,
  StatusBadge,
} from "@shared/components";
import type { Agent, Scenario } from "@portal/api/agents";
import "@portal/views/AgentBuilder.css";

interface ScenariosPanelProps {
  agent: Agent;
}

/**
 * Named test cases describing expected behaviour. Edits live in local state —
 * the surface is mock-driven, so adding a row only stages it client-side until
 * the submit endpoint exists.
 */
export function ScenariosPanel({ agent }: ScenariosPanelProps) {
  const { t } = useTranslation();
  // Seed from the agent and re-seed when the selection changes (key prop on the
  // builder forces a remount, so a plain useState initialiser is enough).
  const [scenarios, setScenarios] = useState<Scenario[]>(agent.scenarios);
  const [name, setName] = useState("");
  const [expectation, setExpectation] = useState("");

  const canAdd = name.trim() !== "" && expectation.trim() !== "";

  function addScenario() {
    if (!canAdd) return;
    const next: Scenario = {
      id: `sc-local-${Date.now()}`,
      name: name.trim(),
      expectation: expectation.trim(),
      enabled: true,
    };
    // TODO(backend): POST /v1/agents/{id}/scenarios { name, expectation } —
    // persist the scenario, then replace the optimistic row with the response.
    setScenarios((cur) => [...cur, next]);
    setName("");
    setExpectation("");
  }

  function toggleEnabled(id: string) {
    setScenarios((cur) =>
      cur.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }

  return (
    <div className="portal-agents__panel">
      <ul className="portal-agents__scenarios">
        {scenarios.map((s) => (
          <li key={s.id} className="portal-agents__scenario">
            <div className="portal-agents__scenario-text">
              <div className="portal-agents__scenario-head">
                <strong>{s.name}</strong>
                <StatusBadge
                  tone={s.enabled ? "success" : "neutral"}
                  size="sm"
                  showDot={false}
                >
                  {s.enabled
                    ? t("agentBuilder.scenarios.inEval")
                    : t("agentBuilder.scenarios.muted")}
                </StatusBadge>
              </div>
              <span className="portal-agents__scenario-expect">
                {s.expectation}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleEnabled(s.id)}
            >
              {s.enabled
                ? t("agentBuilder.scenarios.mute")
                : t("agentBuilder.scenarios.enable")}
            </Button>
          </li>
        ))}
      </ul>

      <div className="portal-agents__scenario-add">
        <Chip tone="blue" size="sm">
          {t("agentBuilder.scenarios.addScenario")}
        </Chip>
        <div className="portal-agents__scenario-form">
          <FormField label={t("agentBuilder.scenarios.nameLabel")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("agentBuilder.scenarios.namePlaceholder")}
            />
          </FormField>
          <FormField label={t("agentBuilder.scenarios.expectationLabel")}>
            <Input
              value={expectation}
              onChange={(e) => setExpectation(e.target.value)}
              placeholder={t("agentBuilder.scenarios.expectationPlaceholder")}
            />
          </FormField>
          <Button size="sm" onClick={addScenario} disabled={!canAdd}>
            {t("agentBuilder.scenarios.add")}
          </Button>
        </div>
      </div>
    </div>
  );
}
