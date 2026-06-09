import { Suspense } from "react";
import { Loader } from "@mantine/core";
import { ToggleSwitch } from "@shared/components/ToggleSwitch";
import { Card } from "@shared/components/Card";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";

/** One tool in a policy's fixed chain: whether it runs + its configured params. */
export interface PolicyToolState {
  /** Frontend tool-registry id (also the registry key + the thing we map to an endpoint). */
  operation: string;
  /** Whether this tool runs as part of the policy (the per-tool on/off). */
  enabled: boolean;
  /** Tool-specific parameters (the shape its endpoint accepts). */
  parameters: Record<string, unknown>;
}

interface PolicyToolConfigProps {
  /** The policy's fixed tool chain — locked (no add/remove), only configurable. */
  tools: PolicyToolState[];
  toolRegistry: Partial<ToolRegistry>;
  onChange: (tools: PolicyToolState[]) => void;
  /** Read-only when the policy is managed / the user can't configure. */
  editable?: boolean;
}

/**
 * Locked, configure-only tool panel for a policy. The chain is fixed (you can't
 * add or remove tools); each tool is a section that renders its OWN settings form
 * from the tool registry (`automationSettings`) — the same forms the automation
 * builder uses — so the config is generated from the tools in the workflow, not
 * hardcoded per policy. The parameters produced here are exactly what the backend
 * engine POSTs to each tool's endpoint.
 */
export function PolicyToolConfig({
  tools,
  toolRegistry,
  onChange,
  editable = true,
}: PolicyToolConfigProps) {
  const patchTool = (index: number, patch: Partial<PolicyToolState>) =>
    onChange(tools.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  return (
    <div className="pol-tool-config">
      {tools.map((tool, index) => {
        const entry = toolRegistry[tool.operation as ToolId];
        const Settings = entry?.automationSettings ?? null;
        return (
          <Card key={tool.operation} padding="none">
            <div className="pol-tool-head">
              <span className="pol-tool-icon">{entry?.icon}</span>
              <span className="pol-tool-name">
                {entry?.name ?? tool.operation}
              </span>
              <ToggleSwitch
                size="sm"
                checked={tool.enabled}
                disabled={!editable}
                onChange={(checked) => patchTool(index, { enabled: checked })}
                aria-label={`Enable ${entry?.name ?? tool.operation}`}
              />
            </div>
            {tool.enabled &&
              (tool.operation === "redact" ? (
                // Redact has a bespoke config: the editable word/regex list +
                // advanced options, with mode + regex locked on for policies.
                <div className="pol-tool-body">
                  <PolicyRedactConfig
                    parameters={tool.parameters}
                    onChange={(parameters) => patchTool(index, { parameters })}
                    disabled={!editable}
                  />
                </div>
              ) : Settings ? (
                <div className="pol-tool-body">
                  <Suspense fallback={<Loader size="sm" />}>
                    <Settings
                      parameters={tool.parameters}
                      onParameterChange={(key: string, value: unknown) =>
                        patchTool(index, {
                          parameters: { ...tool.parameters, [key]: value },
                        })
                      }
                      disabled={!editable}
                    />
                  </Suspense>
                </div>
              ) : null)}
          </Card>
        );
      })}
    </div>
  );
}
