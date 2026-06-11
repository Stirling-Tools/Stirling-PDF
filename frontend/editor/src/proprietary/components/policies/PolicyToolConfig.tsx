import { Suspense } from "react";
import { Loader } from "@mantine/core";
import { ToggleSwitch } from "@shared/components/ToggleSwitch";
import { Card } from "@shared/components/Card";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import { PolicyWatermarkConfig } from "@app/components/policies/PolicyWatermarkConfig";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";

/** Plain-language, non-technical descriptions shown by each tool's info button. */
const TOOL_PLAIN_INFO: Record<string, string> = {
  redact:
    "Automatically finds and blacks out sensitive details — like Social Security and card numbers — so they can't be read in the document.",
  sanitize:
    "Removes hidden JavaScript from the file, so nothing can run automatically when someone opens it.",
  watermark: "Stamps a visible mark (e.g. “Confidential”) across every page.",
};

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
              {TOOL_PLAIN_INFO[tool.operation] && (
                <AppTooltip
                  content={TOOL_PLAIN_INFO[tool.operation]}
                  sidebarTooltip
                  pinOnClick
                >
                  <button
                    type="button"
                    className="pol-info-btn"
                    aria-label={`What does ${entry?.name ?? tool.operation} do?`}
                  >
                    <LocalIcon
                      icon="info-outline-rounded"
                      width="1rem"
                      height="1rem"
                      style={{ color: "var(--icon-files-color)" }}
                    />
                  </button>
                </AppTooltip>
              )}
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
                // Redact config is reduced to just the PII type picker.
                <div className="pol-tool-body">
                  <PolicyRedactConfig
                    parameters={tool.parameters}
                    onChange={(parameters) => patchTool(index, { parameters })}
                    disabled={!editable}
                  />
                </div>
              ) : tool.operation === "sanitize" ? (
                // Sanitize is config-less: it only removes JavaScript (params
                // are fixed in the policy preset), so no settings are shown.
                <></>
              ) : tool.operation === "watermark" ? (
                // Watermark: full settings minus the "Flatten PDF pages to
                // images" toggle (hidden), with flatten forced on.
                <div className="pol-tool-body">
                  <PolicyWatermarkConfig
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
